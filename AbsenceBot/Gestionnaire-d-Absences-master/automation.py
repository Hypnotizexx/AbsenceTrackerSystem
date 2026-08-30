import os
import sys

if getattr(sys, "frozen", False):
    os.environ["PLAYWRIGHT_BROWSERS_PATH"] = os.path.join(sys._MEIPASS, "ms-playwright")

from playwright.sync_api import sync_playwright
import psycopg2
from settings import load_settings


def type_input(page, selector, value):
    field = page.locator(selector)
    field.click()
    field.press("Control+A")
    field.press("Backspace")
    field.type(str(value), delay=1)


def run_playwright(date, on_ready_to_finish, finish_event):
    settings = load_settings()
    conn = psycopg2.connect(
        dbname=settings["DB_NAME"],
        user=settings["DB_USER"],
        password=settings["DB_PASS"],
        host=settings["DB_HOST"],
        port=5432,
        sslmode="prefer",
    )

    cur = conn.cursor()
    cur.execute("""
        SELECT date,debut,fin,classe,code,nom,motif,justifiee
        FROM absences
        WHERE date = %s
        ORDER BY classe, nom
    """, (date,))
    rows = cur.fetchall()
    print("ABSENCES:", rows)
    cur.close()
    conn.close()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        try:
            page = browser.new_page()
            page.goto(
                "https://www.cpge.ac.ma/Intranet/Login.aspx?ReturnUrl=%2fIntranet%2fCPGEPages%2fAbsenceEleve.aspx"
            )
            page.fill("#txtUserNom", settings["CODE"])
            page.fill("#txtPassword", settings["MDP"])
            page.click("#btnLogin")
            page.wait_for_load_state("networkidle")
            page.goto("https://www.cpge.ac.ma/Intranet/CPGEPages/AbsenceEleve.aspx")
            page.click("#ctl00_btnNew")
            page.wait_for_load_state("networkidle")
            page.locator("#ctl00_PlaceHolderMain_rblTypeAbsence_1").check()
            page.wait_for_load_state("networkidle")

            for absence in rows:
                page.click("#ctl00_PlaceHolderMain_btnContinuer")
                page.wait_for_load_state("networkidle")
                page.fill(
                    "#ctl00_PlaceHolderMain_txtAbsenceEleveDateDebutDate",
                    absence[0].strftime("%d%m%Y"),
                )
                type_input(
                    page,
                    "#ctl00_PlaceHolderMain_txtAbsenceEleveDateDebutHeure",
                    absence[1].strftime("%H%M"),
                )
                type_input(
                    page,
                    "#ctl00_PlaceHolderMain_txtAbsenceEleveDateFinHeure",
                    absence[2].strftime("%H%M"),
                )
                page.locator(
                    "#ctl00_PlaceHolderMain_ImgBtnPUAbsenceEleve_Id_EleveCNEEleve"
                ).click()
                page.locator("#ctl00_PopUpModal_PanelPopup").wait_for()
                page.locator("input[title='CodeElève']").fill(absence[4])
                page.locator("#ctl00_PopUpModal_BtnPopUpFind").click()
                page.locator("#ctl00_PopUpModal_grdPUListe").wait_for()
                row = page.locator(
                    "#ctl00_PopUpModal_grdPUListe tr", has_text=absence[4]
                ).first
                row.locator("input[type='image']").click()
                page.locator("#ctl00_PopUpModal_PanelPopup").wait_for(state="hidden")
                duration = absence[2].hour - absence[1].hour
                page.locator(
                    "#ctl00_PlaceHolderMain_txtAbsenceEleveDureeAbsence"
                ).fill(str(duration))
                page.locator(
                    "#ctl00_PlaceHolderMain_ddlAbsenceEleve_Id_MotifAbsenceMotifMotifAbsence"
                ).select_option(value=str(absence[6]))
                page.locator("#ctl00_PlaceHolderMain_ddlAbsenceEleveJustifiee").select_option(
                    value="true" if absence[7] else "false"
                )
                page.click("#ctl00_btnSave")
                page.locator("#ctl00_btnNew").wait_for(state="visible")
                page.locator("#ctl00_btnNew").click()

            on_ready_to_finish()
            finish_event.wait()
        finally:
            browser.close()
