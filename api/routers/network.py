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

            _TRANSFER_SQL = f"""
                SELECT
                    aout.CustomerID AS from_customer_id,
                    ain.CustomerID  AS to_customer_id,
                    CONCAT(CONVERT(AES_DECRYPT(cf.FirstName,@encryption_key) USING utf8mb4),' ',
                           CONVERT(AES_DECRYPT(cf.LastName, @encryption_key) USING utf8mb4)) AS from_name,
                    CONCAT(CONVERT(AES_DECRYPT(ct.FirstName,@encryption_key) USING utf8mb4),' ',
                           CONVERT(AES_DECRYPT(ct.LastName, @encryption_key) USING utf8mb4)) AS to_name,
                    SUM(tout.Amount)  AS total_amount,
                    COUNT(*)          AS txn_count
                FROM Transactions tout
                JOIN Transactions tin  ON tin.ReferenceID = tout.TransactionID
                                      AND tout.TransactionType = 'Transfer_Out'
                                      AND tin.TransactionType  = 'Transfer_In'
                JOIN Accounts aout ON tout.AccountID = aout.AccountID
                JOIN Accounts ain  ON tin.AccountID  = ain.AccountID
                JOIN Customers cf  ON aout.CustomerID = cf.CustomerID
                JOIN Customers ct  ON ain.CustomerID  = ct.CustomerID
                WHERE aout.CustomerID != ain.CustomerID
                  AND (aout.CustomerID = %s OR ain.CustomerID = %s)
                  {date_conds}
                GROUP BY aout.CustomerID, ain.CustomerID, cf.FirstName, cf.LastName, ct.FirstName, ct.LastName
                ORDER BY total_amount DESC
                LIMIT 200
            """
            cursor.execute(_TRANSFER_SQL, [customer_id, customer_id, *date_params])
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
                        SELECT
                            aout.CustomerID AS from_customer_id,
                            ain.CustomerID  AS to_customer_id,
                            CONCAT(CONVERT(AES_DECRYPT(cf.FirstName,@encryption_key) USING utf8mb4),' ',
                                   CONVERT(AES_DECRYPT(cf.LastName, @encryption_key) USING utf8mb4)) AS from_name,
                            CONCAT(CONVERT(AES_DECRYPT(ct.FirstName,@encryption_key) USING utf8mb4),' ',
                                   CONVERT(AES_DECRYPT(ct.LastName, @encryption_key) USING utf8mb4)) AS to_name,
                            SUM(tout.Amount) AS total_amount,
                            COUNT(*) AS txn_count
                        FROM Transactions tout
                        JOIN Transactions tin  ON tin.ReferenceID = tout.TransactionID
                                              AND tout.TransactionType = 'Transfer_Out'
                                              AND tin.TransactionType  = 'Transfer_In'
                        JOIN Accounts aout ON tout.AccountID = aout.AccountID
                        JOIN Accounts ain  ON tin.AccountID  = ain.AccountID
                        JOIN Customers cf  ON aout.CustomerID = cf.CustomerID
                        JOIN Customers ct  ON ain.CustomerID  = ct.CustomerID
                        WHERE aout.CustomerID != ain.CustomerID
                          AND (aout.CustomerID IN ({placeholders}) OR ain.CustomerID IN ({placeholders}))
                          AND aout.CustomerID != %s AND ain.CustomerID != %s
                          {date_conds}
                        GROUP BY aout.CustomerID, ain.CustomerID, cf.FirstName, cf.LastName, ct.FirstName, ct.LastName
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
