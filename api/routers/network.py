import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "app"))

from fastapi import APIRouter, Depends, HTTPException, Query
from mysql.connector import Error as MySQLError

from db_connection import get_db
from dependencies import db_error_to_http, require_manager_or_auditor

router = APIRouter()


@router.get("/customer-network")
def customer_network(
    customer_id: int = Query(...),
    depth: int = Query(1, ge=1, le=2),
    date_from: str = Query("", description="YYYY-MM-DD"),
    date_to: str = Query("", description="YYYY-MM-DD"),
    user=Depends(require_manager_or_auditor),
):
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                "SELECT CustomerID FROM Customers WHERE CustomerID = %s", (customer_id,)
            )
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Customer not found")

            date_conds = ""
            date_params = []
            if date_from:
                date_conds += " AND txn_date >= %s"
                date_params.append(date_from)
            if date_to:
                date_conds += " AND txn_date <= %s"
                date_params.append(date_to)

            cursor.execute(
                f"""
                SELECT from_customer_id, to_customer_id, from_name, to_name,
                       SUM(amount) AS total_amount, COUNT(*) AS txn_count
                FROM vw_transfer_pairs
                WHERE (from_customer_id = %s OR to_customer_id = %s)
                  {date_conds}
                GROUP BY from_customer_id, to_customer_id, from_name, to_name
                ORDER BY total_amount DESC
                LIMIT 200
                """,
                [customer_id, customer_id, *date_params],
            )
            direct_edges = cursor.fetchall()

            nodes = {}
            edges = []

            def add_node(cid, name):
                if cid not in nodes:
                    nodes[cid] = {
                        "id": cid,
                        "label": name,
                        "is_root": cid == customer_id,
                    }

            for e in direct_edges:
                fid, tid = e["from_customer_id"], e["to_customer_id"]
                add_node(fid, e["from_name"])
                add_node(tid, e["to_name"])
                edges.append({
                    "from": fid,
                    "to": tid,
                    "amount": float(e["total_amount"] or 0),
                    "count": int(e["txn_count"]),
                })

            if depth == 2 and len(nodes) < 100:
                neighbor_ids = [nid for nid in nodes if nid != customer_id]
                if neighbor_ids:
                    placeholders = ",".join(["%s"] * len(neighbor_ids))
                    cursor.execute(
                        f"""
                        SELECT from_customer_id, to_customer_id, from_name, to_name,
                               SUM(amount) AS total_amount, COUNT(*) AS txn_count
                        FROM vw_transfer_pairs
                        WHERE (from_customer_id IN ({placeholders}) OR to_customer_id IN ({placeholders}))
                          AND from_customer_id != %s AND to_customer_id != %s
                          {date_conds}
                        GROUP BY from_customer_id, to_customer_id, from_name, to_name
                        ORDER BY total_amount DESC
                        LIMIT {200 - len(edges)}
                        """,
                        [*neighbor_ids, *neighbor_ids, customer_id, customer_id, *date_params],
                    )
                    for e in cursor.fetchall():
                        fid, tid = e["from_customer_id"], e["to_customer_id"]
                        add_node(fid, e["from_name"])
                        add_node(tid, e["to_name"])
                        edge_key = (fid, tid)
                        if not any(ex["from"] == fid and ex["to"] == tid for ex in edges):
                            edges.append({
                                "from": fid,
                                "to": tid,
                                "amount": float(e["total_amount"] or 0),
                                "count": int(e["txn_count"]),
                            })

    except HTTPException:
        raise
    except MySQLError as e:
        raise db_error_to_http(e)

    return {
        "customer_id": customer_id,
        "nodes": list(nodes.values()),
        "edges": edges,
    }
