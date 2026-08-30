import json, socket, sys, threading, time, traceback, webview
from io import BytesIO
import pandas as pd
from flask import Flask, render_template, request, jsonify
from automation import run_playwright
from db import (get_absences_by_date, update_absences, delete_absences_bulk,
                delete_absences_by_date_range,
                get_eleves, add_eleve, delete_eleves_bulk,
                get_encadrants, add_encadrant, delete_encadrant)
from settings import load_settings, save_settings

app = Flask(__name__)
WEBVIEW_WINDOW = None
AUTOMATION_LOCK = threading.Lock()
AUTOMATION_STATE_LOCK = threading.Lock()
AUTOMATION_STATE = {"status": "idle", "date": None, "error": None}
AUTOMATION_FINISH_EVENT = None


def set_automation_state(status, date=None, error=None):
    with AUTOMATION_STATE_LOCK:
        AUTOMATION_STATE.update(status=status, date=date, error=error)


def report_error(title):
    message = f"{title}\n{traceback.format_exc()}"
    print(message, file=sys.stderr)
    if WEBVIEW_WINDOW is not None:
        WEBVIEW_WINDOW.evaluate_js(f"console.error({json.dumps(message)})")


def safe_run_playwright(date, finish_event):
    try:
        run_playwright(
            date,
            on_ready_to_finish=lambda: set_automation_state("waiting_for_finish", date),
            finish_event=finish_event,
        )
    except Exception:
        set_automation_state("error", date, "Erreur pendant l'automatisation.")
        report_error(f"Erreur automation ({date})")
    else:
        set_automation_state("idle")
    finally:
        AUTOMATION_LOCK.release()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/settings", methods=["GET", "POST"])
def handle_settings():
    if request.method == "GET":
        return jsonify(load_settings())

    try:
        save_settings(request.json or {})
        return jsonify({"status": "ok"})
    except (TypeError, ValueError) as error:
        return jsonify({"status": "error", "error": str(error)}), 400


@app.route("/api/absences")
def absences():
    date = request.args.get("date")
    if not date:
        return jsonify([])
    return jsonify(get_absences_by_date(date))

@app.route("/api/absences/delete", methods=["POST"])
def delete_absences():
    ids = request.json.get("ids", [])
    delete_absences_bulk(ids)
    return jsonify({"status": "ok"})


@app.route("/api/absences/delete-range", methods=["POST"])
def delete_absences_range():
    data = request.json or {}
    start_date = data.get("start_date")
    end_date = data.get("end_date")

    if not start_date or not end_date:
        return jsonify({"status": "error", "error": "Les deux dates sont obligatoires."}), 400
    if start_date > end_date:
        return jsonify({"status": "error", "error": "La date de début doit précéder la date de fin."}), 400

    deleted_count = delete_absences_by_date_range(start_date, end_date)
    return jsonify({"status": "ok", "deleted_count": deleted_count})


@app.route("/api/save", methods=["POST"])
def save():
    global AUTOMATION_FINISH_EVENT
    rows = request.json
    if not isinstance(rows, list) or not rows:
        return jsonify({"status": "error", "error": "Aucune absence à enregistrer."}), 400

    if not AUTOMATION_LOCK.acquire(blocking=False):
        return jsonify({
            "status": "error",
            "error": "Une automatisation est déjà en cours."
        }), 409

    try:
        update_absences(rows)
    except Exception:
        AUTOMATION_LOCK.release()
        report_error("Erreur update_absences")
        return jsonify({"status": "error", "error": "Erreur lors de l'enregistrement en base."}), 500

    date = rows[0]["date"]
    AUTOMATION_FINISH_EVENT = threading.Event()
    set_automation_state("running", date)
    threading.Thread(
        target=safe_run_playwright,
        args=(date, AUTOMATION_FINISH_EVENT),
        daemon=True,
    ).start()
    return jsonify({"status": "ok"})


@app.route("/api/automation/status")
def automation_status():
    with AUTOMATION_STATE_LOCK:
        return jsonify(AUTOMATION_STATE.copy())


@app.route("/api/automation/finish", methods=["POST"])
def finish_automation():
    with AUTOMATION_STATE_LOCK:
        if AUTOMATION_STATE["status"] != "waiting_for_finish":
            return jsonify({
                "status": "error",
                "error": "L'automatisation n'est pas prête à être terminée."
            }), 409
        finish_event = AUTOMATION_FINISH_EVENT

    if finish_event is not None:
        finish_event.set()
    return jsonify({"status": "ok"})


@app.route("/api/eleves", methods=["GET", "POST"])
def handle_eleves():
    if request.method == "GET":
        search = request.args.get("search", "")
        return jsonify(get_eleves(search))
    elif request.method == "POST":
        add_eleve(request.json)
        return jsonify({"status": "ok"})


@app.route("/api/eleves/delete", methods=["POST"])
def delete_eleves():
    codes = request.json.get("codes", [])
    delete_eleves_bulk(codes)
    return jsonify({"status": "ok"})


@app.route("/api/eleves/upload", methods=["POST"])
def upload_excel():
    if 'file' not in request.files:
        return jsonify({"error": "Aucun fichier reçu"}), 400

    file = request.files['file']
    try:
        raw = file.read()
        try:
            df = pd.read_excel(BytesIO(raw))
        except Exception:
            df = pd.read_html(BytesIO(raw))[0]

        df["nom_complet"] = (
            df["Nom"].astype(str).str.strip() + " " + df["Prénom"].astype(str).str.strip()
        )

        count = 0
        for _, row in df.dropna(subset=["CNE"]).iterrows():
            add_eleve({
                "nom": row["nom_complet"],
                "classe": row["Classe"],
                "code": str(row["CNE"])
            })
            count += 1

        return jsonify({"status": "ok", "message": f"{count} élèves importés."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/encadrants", methods=["GET", "POST", "DELETE"])
def handle_encadrants():
    if request.method == "GET":
        return jsonify(get_encadrants())
    elif request.method == "POST":
        add_encadrant(request.json)
        return jsonify({"status": "ok"})
    elif request.method == "DELETE":
        delete_encadrant(request.args.get("nom"))
        return jsonify({"status": "ok"})


def start_flask():
    app.run(port=2846, debug=False, use_reloader=False)


def wait_for_server(host="127.0.0.1", port=2846, timeout=10):
    start = time.time()
    while time.time() - start < timeout:
        try:
            with socket.create_connection((host, port), timeout=0.5):
                return True
        except OSError:
            time.sleep(0.1)
    return False


if __name__ == "__main__":
    t = threading.Thread(target=start_flask, daemon=True)
    t.start()
    wait_for_server()
    WEBVIEW_WINDOW = webview.create_window("Gestion des Absences - CPGE", "http://127.0.0.1:2846", maximized=True)
    webview.start(debug=False)