function switchTab(tabId, btnElement) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    btnElement.classList.add('active');
}

function showLoading(selector, colspan, message = "Chargement...") {
    const tbody = document.querySelector(selector);
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="${colspan}" class="loading-message">${message}</td></tr>`;
    }
}

const CONTENT_LOAD_TIMEOUT_MS = 10000;
const AUTOMATION_POLL_INTERVAL_MS = 1000;

async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONTENT_LOAD_TIMEOUT_MS);

    try {
        return await fetch(url, {...options, signal: controller.signal});
    } finally {
        clearTimeout(timeoutId);
    }
}

async function loadAbsences(){
    const date = document.getElementById("date").value;
    if(!date) return alert("Sélectionnez une date");

    showLoading("#table tbody", 7, "Chargement des absences...");
    try {
        const res = await fetchWithTimeout(`/api/absences?date=${date}`);
        if (!res.ok) throw new Error(`Erreur serveur (${res.status})`);

        const data = await res.json();
        const tbody = document.querySelector("#table tbody");
        tbody.innerHTML = "";

        if(data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:gray;">Aucune absence.</td></tr>`;
            return;
        }

        data.forEach(r => {
            const tr = document.createElement("tr");
            tr.dataset.id = r.id;
            tr.dataset.date = r.date;
            tr.innerHTML = `
                <td><input type="checkbox" class="absence-select" value="${r.id}"></td>
                <td>${r.classe}</td><td>${r.nom}</td><td>${r.debut}</td><td>${r.fin}</td>
                <td>
                    <select class="motif">
                        <option value="5">Maladie</option><option value="6">Concours français</option>
                        <option value="7">Autre</option><option value="8">Grève des élèves</option>
                        <option value="9">Sanction</option>
                    </select>
                </td>
                <td>
                    <select class="justifiee">
                        <option value="true">Oui</option><option value="false">Non</option>
                    </select>
                </td>`;
            tbody.appendChild(tr);
            tr.querySelector(".motif").value = r.motif;
            tr.querySelector(".justifiee").value = String(r.justifiee);
        });

        const selectAllBtn = document.getElementById("btn-select-all-abs");
        if(selectAllBtn) selectAllBtn.textContent = "Sélectionner Tout";
    } catch (error) {
        console.error(error);
        const message = error.name === "AbortError"
            ? "Le chargement a dépassé le délai."
            : "Impossible de charger les absences.";
        showLoading("#table tbody", 7, message);
    }
}

async function saveAbsences() {
    const rows = [];
    document.querySelectorAll("#table tbody tr").forEach(tr => {
        if (tr.dataset.id) {
            rows.push({
                id: parseInt(tr.dataset.id),
                motif: parseInt(tr.querySelector(".motif").value),
                justifiee: tr.querySelector(".justifiee").value,
                date: tr.dataset.date
            });
        }
    });

    if (rows.length === 0) return alert("Aucune donnée.");

    try {
        const res = await fetch("/api/save", {
            method: "POST", 
            headers: { "Content-Type": "application/json" }, 
            body: JSON.stringify(rows)
        });

        if (!res.ok) {
            throw new Error(`Erreur serveur (${res.status})`);
        }

        const data = await res.json();
        if (data.status === "ok") {
            alert("Enregistré ! L'automatisation démarre.");
        }
    } catch (error) {
        console.error(error);
        alert("Une erreur est survenue : " + error.message);
    }
}

function toggleSelectAllAbsences(btn) {
    const checkboxes = document.querySelectorAll(".absence-select");
    if (btn.textContent === "Sélectionner Tout") {
        checkboxes.forEach(cb => cb.checked = true);
        btn.textContent = "Désélectionner Tout";
    } else {
        checkboxes.forEach(cb => cb.checked = false);
        btn.textContent = "Sélectionner Tout";
    }
}

async function deleteSelectedAbsences() {
    const selected = [];
    document.querySelectorAll(".absence-select:checked").forEach(cb => selected.push(parseInt(cb.value)));
    
    if(selected.length === 0) return alert("Aucune absence sélectionnée.");
    if(confirm(`Supprimer les ${selected.length} absences sélectionnées ?`)) {
        await fetch("/api/absences/delete", {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ids: selected})
        });
        loadAbsences();
    }
}

async function deleteAbsencesByDateRange() {
    const startDate = document.getElementById("delete-start-date").value;
    const endDate = document.getElementById("delete-end-date").value;

    if (!startDate || !endDate) return alert("Sélectionnez les deux dates.");
    if (startDate > endDate) return alert("La date de début doit précéder la date de fin.");

    const period = `du ${startDate} au ${endDate}`;
    if (!confirm(`Supprimer toutes les absences ${period} ?`)) return;

    try {
        const res = await fetch("/api/absences/delete-range", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({start_date: startDate, end_date: endDate})
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Erreur serveur (${res.status})`);

        alert(`${data.deleted_count} absence(s) supprimée(s).`);
        loadAbsences();
    } catch (error) {
        console.error(error);
        alert("Impossible de supprimer la période : " + error.message);
    }
}

async function loadEleves() {
    const searchQuery = document.getElementById("search-eleve").value;
    showLoading("#eleves-table tbody", 4, "Chargement des élèves...");
    try {
        const res = await fetchWithTimeout(`/api/eleves?search=${encodeURIComponent(searchQuery)}`);
        if (!res.ok) throw new Error(`Erreur serveur (${res.status})`);

        const data = await res.json();
        const tbody = document.querySelector("#eleves-table tbody");
        tbody.innerHTML = "";

        data.forEach(r => {
            tbody.innerHTML += `<tr>
                <td><input type="checkbox" class="eleve-select" value="${r.code}"></td>
                <td>${r.nom}</td>
                <td>${r.classe}</td>
                <td>${r.code}</td>
            </tr>`;
        });
        document.getElementById("btn-select-all").textContent = "Sélectionner Tout";
    } catch (error) {
        console.error(error);
        const message = error.name === "AbortError"
            ? "Le chargement a dépassé le délai."
            : "Impossible de charger les élèves.";
        showLoading("#eleves-table tbody", 4, message);
    }
}

async function addEleve() {
    const nom = document.getElementById("el-nom").value;
    const classe = document.getElementById("el-classe").value;
    const code = document.getElementById("el-code").value;
    if(!nom || !classe || !code) return alert("Remplir tous les champs");
    
    await fetch("/api/eleves", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({nom, classe, code})
    });
    document.getElementById("el-nom").value = "";
    document.getElementById("el-classe").value = "";
    document.getElementById("el-code").value = "";
    loadEleves();
}

async function uploadFile() {
    const fileInput = document.getElementById("excel-file");
    if (fileInput.files.length === 0) return alert("Sélectionnez un fichier");

    const formData = new FormData();
    formData.append("file", fileInput.files[0]);

    const res = await fetch("/api/eleves/upload", {
        method: "POST",
        body: formData
    });
    
    const data = await res.json();
    if (data.status === "ok") {
        alert(data.message);
        loadEleves();
    } else {
        alert("Erreur: " + data.error);
    }
}

function toggleSelectAllEleves(btn) {
    const checkboxes = document.querySelectorAll(".eleve-select");
    if (btn.textContent === "Sélectionner Tout") {
        checkboxes.forEach(cb => cb.checked = true);
        btn.textContent = "Désélectionner Tout";
    } else {
        checkboxes.forEach(cb => cb.checked = false);
        btn.textContent = "Sélectionner Tout";
    }
}

async function deleteSelectedEleves() {
    const selected = [];
    document.querySelectorAll(".eleve-select:checked").forEach(cb => selected.push(cb.value));
    
    if(selected.length === 0) return alert("Aucun élève sélectionné.");
    if(confirm(`Supprimer les ${selected.length} élèves sélectionnés ?`)) {
        await fetch("/api/eleves/delete", {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({codes: selected})
        });
        loadEleves();
    }
}



function toggleChecklistMenu(event) {
    event.stopPropagation();
    const menu = document.getElementById("en-classes-checklist");
    menu.classList.toggle("show");
}


document.addEventListener("change", function(e) {
    if (e.target.closest("#en-classes-checklist")) {
        const checkedBoxes = document.querySelectorAll("#en-classes-checklist input:checked");
        const header = document.querySelector(".dropdown-checklist-header");
        
        if (checkedBoxes.length === 0) {
            header.textContent = "Choisir les classes...";
        } else {
            const values = Array.from(checkedBoxes).map(cb => cb.value);
            header.textContent = values.join(", ");
        }
    }
});


document.addEventListener("click", function(e) {
    const checklist = document.querySelector(".dropdown-checklist");
    if (checklist && !checklist.contains(e.target)) {
        document.getElementById("en-classes-checklist").classList.remove("show");
    }
});



async function addEncadrant() {
    const nom = document.getElementById("en-nom").value;
    const mdp = document.getElementById("en-mdp").value;
    
    const checkedBoxes = document.querySelectorAll("#en-classes-checklist input:checked");
    const classes = Array.from(checkedBoxes).map(cb => cb.value);

    if(!nom || classes.length === 0 || !mdp) {
        return alert("Veuillez remplir tous les champs et cocher au moins une classe.");
    }
    
    await fetch("/api/encadrants", {
        method: "POST", 
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({nom, classes, mdp})
    });
    
    document.getElementById("en-nom").value = "";
    document.getElementById("en-mdp").value = "";
    
    document.querySelectorAll("#en-classes-checklist input").forEach(cb => cb.checked = false);
    document.querySelector(".dropdown-checklist-header").textContent = "Choisir les classes...";
    document.getElementById("en-classes-checklist").classList.remove("show");
    
    loadEncadrants();
}

async function loadEncadrants() {
    showLoading("#encadrants-table tbody", 4, "Chargement des encadrants...");
    try {
        const res = await fetchWithTimeout("/api/encadrants");
        if (!res.ok) throw new Error(`Erreur serveur (${res.status})`);

        const data = await res.json();
        const tbody = document.querySelector("#encadrants-table tbody");
        tbody.innerHTML = "";

        data.forEach(r => {
            const classesAffichees = Array.isArray(r.classes) ? r.classes.join(", ") : r.classes;
            tbody.innerHTML += `<tr>
                <td>${r.nom}</td><td>${classesAffichees}</td><td>${r.mdp}</td>
                <td><button style="background:#dc2626;" onclick="deleteEncadrant('${r.nom}')">Supprimer</button></td>
            </tr>`;
        });
    } catch (error) {
        console.error(error);
        const message = error.name === "AbortError"
            ? "Le chargement a dépassé le délai."
            : "Impossible de charger les encadrants.";
        showLoading("#encadrants-table tbody", 4, message);
    }
}

async function deleteEncadrant(nom) {
    if(confirm("Supprimer cet encadrant ?")) {
        await fetch(`/api/encadrants?nom=${nom}`, { method: "DELETE" });
        loadEncadrants();
    }
}

async function loadSettings() {
    const status = document.getElementById("settings-status");
    status.textContent = "Chargement des paramètres...";
    status.className = "loading-message";
    try {
        const res = await fetchWithTimeout("/api/settings");
        if (!res.ok) throw new Error(`Erreur serveur (${res.status})`);

        const settings = await res.json();
        document.getElementById("setting-db-name").value = settings.DB_NAME || "";
        document.getElementById("setting-db-user").value = settings.DB_USER || "";
        document.getElementById("setting-db-pass").value = settings.DB_PASS || "";
        document.getElementById("setting-db-host").value = settings.DB_HOST || "";
        document.getElementById("setting-code").value = settings.CODE || "";
        document.getElementById("setting-mdp").value = settings.MDP || "";
        status.textContent = "";
        status.className = "";
    } catch (error) {
        console.error(error);
        status.textContent = error.name === "AbortError"
            ? "Le chargement a dépassé le délai."
            : "Impossible de charger les paramètres.";
        status.className = "error";
    }
}

async function saveSettings(event) {
    event.preventDefault();
    const settings = {
        DB_NAME: document.getElementById("setting-db-name").value,
        DB_USER: document.getElementById("setting-db-user").value,
        DB_PASS: document.getElementById("setting-db-pass").value,
        DB_HOST: document.getElementById("setting-db-host").value,
        CODE: document.getElementById("setting-code").value,
        MDP: document.getElementById("setting-mdp").value
    };
    const res = await fetch("/api/settings", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(settings)
    });
    const data = await res.json();
    const status = document.getElementById("settings-status");
    status.textContent = data.status === "ok" ? "Paramètres enregistrés." : data.error;
    status.className = data.status === "ok" ? "success" : "error";
}

function toggleSettingsPasswords(checkbox) {
    ["setting-db-pass", "setting-mdp"].forEach(id => {
        document.getElementById(id).type = checkbox.checked ? "text" : "password";
    });
}

async function pollAutomationStatus() {
    const statusElement = document.getElementById("automation-status");
    const finishButton = document.getElementById("finish-automation");
    if (!statusElement || !finishButton) return;

    try {
        const res = await fetchWithTimeout("/api/automation/status");
        if (!res.ok) throw new Error(`Erreur serveur (${res.status})`);

        const data = await res.json();
        finishButton.hidden = data.status !== "waiting_for_finish";
        statusElement.className = data.status;

        if (data.status === "running") {
            statusElement.textContent = "Remplissage en cours...";
        } else if (data.status === "waiting_for_finish") {
            statusElement.textContent = "Remplissage terminé. Vérifiez le portail.";
        } else if (data.status === "error") {
            statusElement.textContent = data.error || "Erreur pendant l'automatisation.";
        } else {
            statusElement.textContent = "";
            statusElement.className = "";
        }
    } catch (error) {
        console.error(error);
    }
}

async function finishAutomation() {
    const finishButton = document.getElementById("finish-automation");
    finishButton.disabled = true;

    try {
        const res = await fetch("/api/automation/finish", {method: "POST"});
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Erreur serveur (${res.status})`);
        await pollAutomationStatus();
    } catch (error) {
        finishButton.disabled = false;
        alert("Impossible de terminer l'automatisation : " + error.message);
    }
}

pollAutomationStatus();
setInterval(pollAutomationStatus, AUTOMATION_POLL_INTERVAL_MS);