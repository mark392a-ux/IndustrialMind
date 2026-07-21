"""
Knowledge graph using NetworkX.
ISO 15926 Part 2 entity types:
FunctionalObject, PhysicalObject, Activity, ClassOfEquipment, Document

GraphStore is an abstract base so we can swap NetworkX for Neo4j
in production without touching any other code.
"""

from abc import ABC, abstractmethod
from typing import Optional
import networkx as nx
import pickle
from pathlib import Path


class NodeType:
    FUNCTIONAL_OBJECT  = "FunctionalObject"
    PHYSICAL_OBJECT    = "PhysicalObject"
    ACTIVITY           = "Activity"
    CLASS_OF_EQUIPMENT = "ClassOfEquipment"
    DOCUMENT           = "Document"


class RelType:
    IS_PART_OF      = "isPartOf"
    HAS_PARTICIPANT  = "hasParticipant"
    IS_RELATED_TO   = "isRelatedTo"
    REFERENCED_BY   = "referencedBy"
    HAS_ACTIVITY    = "hasActivity"


class GraphStore(ABC):
    @abstractmethod
    def add_node(self, node_id, node_type, label, plant_id="plant_001", **props): ...

    @abstractmethod
    def add_edge(self, src, dst, relation, **props): ...

    @abstractmethod
    def get_neighbors(self, node_id, depth=1): ...

    @abstractmethod
    def get_node(self, node_id): ...

    @abstractmethod
    def search_nodes(self, query, node_type=None, plant_id="plant_001"): ...

    @abstractmethod
    def get_stats(self): ...

    @abstractmethod
    def save(self): ...

    @abstractmethod
    def load(self): ...

    # ── Delete & Cleanup Abstract Methods ─────────────────────────────────

    @abstractmethod
    def delete_nodes_for_document(self, doc_id: str): ...

    @abstractmethod
    def delete_nodes_by_plant(self, plant_id: str = "plant_001"): ...

    @abstractmethod
    def clear_all(self): ...

    @abstractmethod
    def remove_orphan_nodes(self, plant_id: str = "plant_001"): ...

    @abstractmethod
    def delete_document_nodes_by_filename(self, filename: str, plant_id: str = "plant_001"): ...


class NetworkXStore(GraphStore):
    def __init__(self, persist_path="./data/graph.pkl"):
        self.persist_path = Path(persist_path)
        self.G = nx.DiGraph()
        if self.persist_path.exists():
            self.load()

    def add_node(self, node_id, node_type, label, plant_id="plant_001", **props):
        self.G.add_node(node_id, node_type=node_type, label=label,
                        plant_id=plant_id, **props)

    def add_edge(self, src, dst, relation, **props):
        for n in [src, dst]:
            if n not in self.G:
                self.G.add_node(n, label=n, node_type="unknown")
        self.G.add_edge(src, dst, relation=relation, **props)

    def get_neighbors(self, node_id, depth=1):
        if node_id not in self.G:
            return []
        visited = {node_id}
        frontier = [node_id]
        result = []
        for _ in range(depth):
            next_f = []
            for nid in frontier:
                for nb in list(self.G.successors(nid)) + list(self.G.predecessors(nid)):
                    if nb not in visited:
                        visited.add(nb)
                        next_f.append(nb)
                        data = dict(self.G.nodes[nb])
                        data["id"] = nb
                        if self.G.has_edge(nid, nb):
                            data["relation"] = self.G.edges[nid, nb].get("relation", "")
                        elif self.G.has_edge(nb, nid):
                            data["relation"] = self.G.edges[nb, nid].get("relation", "")
                        result.append(data)
            frontier = next_f
        return result

    def get_node(self, node_id):
        if node_id not in self.G:
            return None
        d = dict(self.G.nodes[node_id])
        d["id"] = node_id
        return d

    def search_nodes(self, query, node_type=None, plant_id="plant_001"):
        q = query.lower()
        results = []
        for nid, data in self.G.nodes(data=True):
            if data.get("plant_id") != plant_id:
                continue
            if node_type and data.get("node_type") != node_type:
                continue
            if q in str(data.get("label", "")).lower():
                r = dict(data)
                r["id"] = nid
                results.append(r)
        return results[:20]

    def get_stats(self):
        type_counts = {}
        for _, d in self.G.nodes(data=True):
            t = d.get("node_type", "unknown")
            type_counts[t] = type_counts.get(t, 0) + 1
        return {
            "total_nodes": self.G.number_of_nodes(),
            "total_edges": self.G.number_of_edges(),
            "node_types": type_counts,
        }

    def save(self):
        self.persist_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.persist_path, "wb") as f:
            pickle.dump(self.G, f)

    def load(self):
        with open(self.persist_path, "rb") as f:
            self.G = pickle.load(f)

    # ── Delete & Cleanup Implementations ──────────────────────────────────

    def delete_nodes_for_document(self, doc_id: str):
        """Remove all nodes that were created from a specific document."""
        nodes_to_remove = [
            n for n, d in self.G.nodes(data=True)
            if d.get("doc_id") == doc_id
        ]
        if nodes_to_remove:
            self.G.remove_nodes_from(nodes_to_remove)
            self.save()
        return len(nodes_to_remove)

    def delete_nodes_by_plant(self, plant_id: str = "plant_001"):
        """Remove ALL nodes/edges for a given plant. Used by 'Clear All'."""
        nodes_to_remove = [
            n for n, d in self.G.nodes(data=True)
            if d.get("plant_id") == plant_id
        ]
        if nodes_to_remove:
            self.G.remove_nodes_from(nodes_to_remove)
            self.save()
        return len(nodes_to_remove)

    def clear_all(self):
        """Wipe the entire graph."""
        count = self.G.number_of_nodes()
        self.G.clear()
        self.save()
        return count

    def remove_orphan_nodes(self, plant_id: str = "plant_001"):
        """Remove nodes that have zero connections (orphaned by document deletion)."""
        orphans = [
            n for n in self.G.nodes()
            if self.G.degree(n) == 0
            and self.G.nodes[n].get("plant_id") == plant_id
        ]
        if orphans:
            self.G.remove_nodes_from(orphans)
            self.save()
        return len(orphans)

    def delete_document_nodes_by_filename(self, filename: str, plant_id: str = "plant_001"):
        """Fallback: remove Document-type nodes matching a filename."""
        to_remove = [
            n for n, d in self.G.nodes(data=True)
            if d.get("node_type") == "Document"
            and d.get("plant_id") == plant_id
            and filename.lower() in str(d.get("label", "")).lower()
        ]
        if to_remove:
            self.G.remove_nodes_from(to_remove)
            self.save()
        return len(to_remove)


# production swap: replace NetworkXStore with Neo4jStore here
# interface is identical so nothing else needs to change
class Neo4jStore(GraphStore):
    """Production implementation — uses Cypher queries via neo4j driver."""
    def __init__(self, uri, user, password):
        raise NotImplementedError("Wire up neo4j driver here for production")

    def add_node(self, *a, **kw): ...
    def add_edge(self, *a, **kw): ...
    def get_neighbors(self, *a, **kw): return []
    def get_node(self, *a, **kw): return None
    def search_nodes(self, *a, **kw): return []
    def get_stats(self): return {}
    def save(self): ...
    def load(self): ...
    
    # Stubs for new methods
    def delete_nodes_for_document(self, doc_id: str): ...
    def delete_nodes_by_plant(self, plant_id: str = "plant_001"): ...
    def clear_all(self): ...
    def remove_orphan_nodes(self, plant_id: str = "plant_001"): ...
    def delete_document_nodes_by_filename(self, filename: str, plant_id: str = "plant_001"): ...


_store: Optional[NetworkXStore] = None


def get_graph_store():
    global _store
    if _store is None:
        _store = NetworkXStore()
    return _store