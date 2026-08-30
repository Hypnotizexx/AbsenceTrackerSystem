import psycopg2
from settings import load_settings


def get_conn():
    settings = load_settings()
    return psycopg2.connect(
        dbname=settings["DB_NAME"],
        user=settings["DB_USER"],
        password=settings["DB_PASS"],
        host=settings["DB_HOST"],
        port=5432,
        sslmode="prefer",
    )


def get_absences_by_date(date):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id,date,debut,fin,classe,code,nom,duree,motif,justifiee
                FROM absences WHERE date=%s ORDER BY classe, nom
            """, (date,))
            rows = cur.fetchall()
            return [{
                "id": row[0], "date": str(row[1]), "debut": row[2].strftime("%H:%M"),
                "fin": row[3].strftime("%H:%M"), "classe": row[4], "code": row[5],
                "nom": row[6], "duree": row[7], "motif": row[8], "justifiee": row[9]
            } for row in rows]


def update_absences(rows):
    with get_conn() as conn:
        with conn.cursor() as cur:
            for row in rows:
                justifiee = row["justifiee"] == "true"
                cur.execute(
                    "UPDATE absences SET motif=%s, justifiee=%s WHERE id=%s",
                    (row["motif"], justifiee, row["id"]),
                )
        conn.commit()


def delete_absences_bulk(ids):
    if not ids:
        return
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM absences WHERE id = ANY(%s)", (ids,))
        conn.commit()


def delete_absences_by_date_range(start_date, end_date):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM absences WHERE date BETWEEN %s AND %s",
                (start_date, end_date),
            )
            deleted_count = cur.rowcount
        conn.commit()
    return deleted_count


def get_eleves(search_query=""):
    with get_conn() as conn:
        with conn.cursor() as cur:
            if search_query:
                cur.execute("""
                    SELECT nom, classe, code FROM eleves
                    WHERE nom ILIKE %s OR code ILIKE %s OR classe ILIKE %s
                    ORDER BY classe, nom
                """, (f"%{search_query}%", f"%{search_query}%", f"%{search_query}%"))
            else:
                cur.execute("SELECT nom, classe, code FROM eleves ORDER BY classe, nom")
            return [{"nom": row[0], "classe": row[1], "code": row[2]} for row in cur.fetchall()]


def add_eleve(data):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM eleves WHERE code = %s", (data["code"],))
            if cur.fetchone():
                cur.execute(
                    "UPDATE eleves SET nom = %s, classe = %s WHERE code = %s",
                    (data["nom"], data["classe"], data["code"]),
                )
            else:
                cur.execute(
                    "INSERT INTO eleves (nom, classe, code) VALUES (%s, %s, %s)",
                    (data["nom"], data["classe"], data["code"]),
                )
        conn.commit()


def delete_eleves_bulk(codes):
    if not codes:
        return
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM eleves WHERE code = ANY(%s)", (codes,))
        conn.commit()


def get_encadrants():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT mdp, classes, nom FROM encadrants ORDER BY nom")
            return [{"mdp": row[0], "classes": row[1], "nom": row[2]} for row in cur.fetchall()]


def add_encadrant(data):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO encadrants (mdp, classes, nom) VALUES (%s, %s, %s)",
                (data["mdp"], data["classes"], data["nom"]),
            )
        conn.commit()


def delete_encadrant(nom):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM encadrants WHERE nom = %s", (nom,))
        conn.commit()
