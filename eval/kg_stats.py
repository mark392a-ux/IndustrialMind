"""Quick script to check KG coverage stats."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / "backend" / ".env")

from app.graph.store import get_graph_store


def main():
    g = get_graph_store()
    stats = g.get_stats()

    print(f"\nGraph: {stats['total_nodes']} nodes, {stats['total_edges']} edges")
    print("\nNode types:")
    for t, count in stats.get("node_types", {}).items():
        print(f"  {t:<25} {count}")

    G = g.G
    doc_nodes = [n for n, d in G.nodes(data=True) if d.get("node_type") == "Document"]
    linked = sum(1 for doc in doc_nodes
                 if list(G.successors(doc)) + list(G.predecessors(doc)))
    total = len(doc_nodes)
    pct = round(linked / total * 100, 1) if total else 0

    print(f"\nDoc linkage: {linked}/{total} ({pct}%)  {'✅' if pct >= 80 else '⚠️ target > 80%'}")

    print("\nAll nodes:")
    for nid, data in list(G.nodes(data=True))[:30]:
        print(f"  [{data.get('node_type','?'):<20}] {data.get('label','')}")
    if stats["total_nodes"] > 30:
        print(f"  ... +{stats['total_nodes'] - 30} more")


if __name__ == "__main__":
    main()
