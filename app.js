// ─────────────────────────────────────────────────────────
// RF Purchase Challan — app logic
// ─────────────────────────────────────────────────────────
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc,
  collection, query, orderBy, onSnapshot, runTransaction, serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const ROLE_LABEL = { admin: "Admin", staff: "Staff", manager: "Manager", purchase: "Accounts" };
const STATUS_LABEL = {
  pending_approval: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
  purchased: "Purchased",
  cancelled: "Cancelled"
};
const STATUS_STAMP_CLASS = {
  pending_approval: "pending",
  approved: "approved",
  rejected: "rejected",
  purchased: "purchased",
  cancelled: "cancelled"
};
const FAKE_EMAIL_DOMAIN = "rfchallan.local";

let currentUser = null;      // { uid, name, email, role }
let currentView = "dashboard";
let currentFilter = "all";
let allChallans = [];
let itemMasterList = [];
let unsubChallans = null;
let unsubUsers = null;
let unsubItems = null;
let selectedChallanId = null;

const $app = document.getElementById("app");

// ---------- utils ----------
function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts instanceof Timestamp ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtMoney(n) {
  if (n === undefined || n === null || n === "") return "—";
  return "₹" + Number(n).toLocaleString("en-IN");
}
function toast(msg, isError) {
  const el = document.createElement("div");
  el.className = "toast" + (isError ? " error" : "");
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function uid4() { return Math.random().toString(36).slice(2, 6); }

// ---------- auth ----------
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) {
      toast("No profile found for this account. Contact your admin.", true);
      await signOut(auth);
      return;
    }
    const profile = snap.data();
    if (profile.active === false) {
      toast("This account has been disabled.", true);
      await signOut(auth);
      return;
    }
    currentUser = { uid: user.uid, email: user.email, name: profile.name, role: profile.role, department: profile.department || "" };
    currentView = "dashboard";
    startListeners();
    renderShell();
  } else {
    currentUser = null;
    stopListeners();
    renderLogin();
  }
});

function startListeners() {
  unsubChallans = onSnapshot(query(collection(db, "challans"), orderBy("createdAt", "desc")), (snap) => {
    allChallans = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (currentView === "dashboard") renderDashboard();
    if (currentView === "detail") renderDetail();
  });
  unsubItems = onSnapshot(collection(db, "itemMaster"), (snap) => {
    itemMasterList = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
    if (currentView === "new") renderNewChallan();
    if (currentView === "admin-items") drawItemMasterRows();
  });
}
function stopListeners() {
  if (unsubChallans) unsubChallans();
  if (unsubUsers) unsubUsers();
  if (unsubItems) unsubItems();
}

async function login(usernameOrEmail, password) {
  const resolvedEmail = usernameOrEmail.includes("@")
    ? usernameOrEmail.trim()
    : usernameOrEmail.trim().toLowerCase() + "@" + FAKE_EMAIL_DOMAIN;
  try {
    await signInWithEmailAndPassword(auth, resolvedEmail, password);
  } catch (e) {
    throw new Error(friendlyAuthError(e));
  }
}
function friendlyAuthError(e) {
  const c = e.code || "";
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found")) return "Incorrect username/email or password.";
  if (c.includes("too-many-requests")) return "Too many attempts. Try again in a bit.";
  if (c.includes("invalid-email")) return "That username has characters that aren't allowed (use only letters, numbers, dots).";
  return "Couldn't sign in — check your connection and try again.";
}

// ---------- render: shell ----------
function renderShell() {
  const role = currentUser.role;
  const tabs = [{ id: "dashboard", label: "Dashboard" }];
  if (role === "staff" || role === "admin") tabs.push({ id: "new", label: "+ New Requisition" });
  if (role === "admin") {
    tabs.push({ id: "admin-users", label: "Manage Users" });
    tabs.push({ id: "admin-items", label: "Manage Items" });
  }
  tabs.push({ id: "roles", label: "Who Does What" });

  $app.innerHTML = `
    <div class="topbar">
      <div class="brand">
        <span class="rf">RF FACTORY</span>
        <span class="sub">Purchase Challan</span>
      </div>
      <div class="who">
        <span>${esc(currentUser.name)}</span>
        <span class="role-chip">${ROLE_LABEL[role] || role}</span>
        <button class="link" id="logoutBtn">Sign out</button>
      </div>
    </div>
    <div class="tabs" id="tabsRow">
      ${tabs.map(t => `<button data-view="${t.id}" class="${currentView === t.id ? "active" : ""}">${t.label}</button>`).join("")}
    </div>
    <main id="mainArea"></main>
  `;

  document.getElementById("logoutBtn").onclick = () => signOut(auth);
  document.getElementById("tabsRow").querySelectorAll("button").forEach(btn => {
    btn.onclick = () => { currentView = btn.dataset.view; renderShell(); };
  });

  if (currentView === "dashboard") renderDashboard();
  else if (currentView === "new") renderNewChallan();
  else if (currentView === "detail") renderDetail();
  else if (currentView === "admin-users") renderAdminUsers();
  else if (currentView === "admin-items") renderAdminItems();
  else if (currentView === "roles") renderRolesInfo();
}

// ---------- render: roles info ----------
function renderRolesInfo() {
  const main = document.getElementById("mainArea");
  if (!main) return;
  const roleRows = [
    { title: "Staff", tag: "staff", points: [
      "Raises a new requisition (fills Department, items, quantities, purpose).",
      "Can view any requisition and its status.",
      "Cannot approve, reject, cancel, or record a purchase/payment."
    ]},
    { title: "Manager", tag: "manager", points: [
      "Reviews requisitions raised by staff.",
      "Approves or Rejects each one, with an optional note.",
      "Can Cancel a requisition at any point before it's purchased.",
      "Does not record vendor or payment details."
    ]},
    { title: "Accounts", tag: "purchase", points: [
      "Sees requisitions once a Manager has approved them.",
      "Records the vendor/shop, bill number, and amount paid.",
      "Marks the requisition as Purchased once payment is done.",
      "Cannot approve, reject, or cancel a requisition."
    ]},
    { title: "Admin", tag: "admin", points: [
      "Adds and manages every user account and their role.",
      "Maintains the item list and reference prices.",
      "Can do anything Staff, Manager, or Accounts can do.",
      "The only role that can disable a user's login."
    ]}
  ];
  main.innerHTML = `
    <div class="section-head"><h2>Who Does What</h2></div>
    ${roleRows.map(r => `
      <div class="card">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <span class="role-tag ${r.tag}" style="font-size:12px;">${r.title}</span>
        </div>
        <ul style="margin:0;padding-left:20px;color:var(--ink);font-size:14px;line-height:1.7;">
          ${r.points.map(p => `<li>${esc(p)}</li>`).join("")}
        </ul>
      </div>
    `).join("")}
  `;
}

// ---------- render: login ----------
function renderLogin() {
  $app.innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <div class="brand-block">
          <div class="rf">RF FACTORY</div>
          <div class="tag">Purchase Requisition Challan</div>
          <div class="hi-tag hi">क्रय अनुरोध चालान</div>
        </div>
        <div id="loginError"></div>
        <form id="loginForm">
          <div class="field">
            <label for="username">Username</label>
            <input type="text" id="username" autocomplete="username" required autocapitalize="none" placeholder="or your full email">
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input type="password" id="password" autocomplete="current-password" required>
          </div>
          <button class="btn btn-primary btn-block" type="submit">Sign in</button>
        </form>
        <div class="hint-msg">Don't have an account? Ask your admin to add you from the Manage Users screen.</div>
      </div>
    </div>
  `;
  document.getElementById("loginForm").onsubmit = async (e) => {
    e.preventDefault();
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const errEl = document.getElementById("loginError");
    errEl.innerHTML = "";
    try {
      await login(username, password);
    } catch (err) {
      errEl.innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
    }
  };
}

// ---------- render: dashboard ----------
function renderDashboard() {
  const main = document.getElementById("mainArea");
  if (!main) return;

  const filters = [
    { id: "all", label: "All" },
    { id: "pending_approval", label: "Pending Approval" },
    { id: "approved", label: "Approved" },
    { id: "purchased", label: "Purchased" },
    { id: "rejected", label: "Rejected" },
    { id: "cancelled", label: "Cancelled" }
  ];

  const filtered = currentFilter === "all" ? allChallans : allChallans.filter(c => c.status === currentFilter);

  main.innerHTML = `
    <div class="section-head"><h2>Requisitions</h2></div>
    <div class="filter-row">
      ${filters.map(f => `<button class="filter-chip ${currentFilter === f.id ? "active" : ""}" data-filter="${f.id}">${f.label}</button>`).join("")}
    </div>
    ${filtered.length === 0 ? `
      <div class="empty-state">
        <div class="big">📋</div>
        <div>No requisitions here yet.</div>
      </div>
    ` : `
      <div class="ledger">
        ${filtered.map(c => `
          <div class="ledger-row" data-id="${c.id}">
            <span class="challan-no">${esc(c.challanNo || "—")}</span>
            <span class="dept">${esc(c.department || "—")}<div class="who">${esc(c.requestedByName || "")}</div></span>
            <span class="date">${fmtDate(c.createdAt)}</span>
            <span><span class="stamp ${STATUS_STAMP_CLASS[c.status] || "pending"}">${STATUS_LABEL[c.status] || c.status}</span></span>
            <span style="text-align:right;color:var(--ink-faint);font-size:13px;">${c.items ? c.items.length : 0} item${c.items && c.items.length === 1 ? "" : "s"}</span>
          </div>
        `).join("")}
      </div>
    `}
  `;

  main.querySelectorAll(".filter-chip").forEach(btn => {
    btn.onclick = () => { currentFilter = btn.dataset.filter; renderDashboard(); };
  });
  main.querySelectorAll(".ledger-row").forEach(row => {
    row.onclick = () => { selectedChallanId = row.dataset.id; currentView = "detail"; renderShell(); };
  });
}

// ---------- render: new challan ----------
let draftItems = [];
function renderNewChallan() {
  const main = document.getElementById("mainArea");
  if (!main) return;
  if (draftItems.length === 0) draftItems = [{ key: uid4(), itemId: "", customName: "", qty: "", price: "", unitRefPrice: null, purpose: "" }];

  const hasDept = !!(currentUser.department && currentUser.department.trim());

  main.innerHTML = `
    <div class="section-head"><span class="num">01</span><h2>Requisition Details</h2><span class="hi">अनुरोध विवरण</span></div>
    <div class="card">
      <div class="grid-2">
        <div class="field">
          <label>Department</label>
          ${hasDept
            ? `<input type="text" id="fDept" value="${esc(currentUser.department)}" readonly style="background:var(--paper);color:var(--ink-soft);">`
            : `<input type="text" id="fDept" value="" placeholder="No department set on your account — ask Admin">
               <div style="font-size:12px;color:var(--red);margin-top:4px;">Your account has no department set. Ask Admin to add one in Manage Users, or type it manually for now.</div>`}
        </div>
        <div class="field">
          <label>Requested By</label>
          <input type="text" id="fRequestedBy" value="${esc(currentUser.name)}" readonly style="background:var(--paper);color:var(--ink-soft);">
        </div>
      </div>
    </div>

    <div class="section-head"><span class="num">02</span><h2>Items Requested</h2><span class="hi">अनुरोधित वस्तुएं</span></div>
    <div class="card">
      <table class="items-table">
        <thead>
          <tr><th>#</th><th>Item</th><th class="qty-col">Qty</th><th class="price-col">Est. Price ₹ (total)</th><th>Purpose</th><th class="rm-col"></th></tr>
        </thead>
        <tbody id="itemsBody"></tbody>
      </table>
      <div class="add-item-row"><button class="btn btn-ghost" id="addItemBtn" type="button">+ Add item</button></div>
    </div>

    <div class="toolbar">
      <button class="btn btn-ghost" id="cancelNewBtn">Cancel</button>
      <button class="btn btn-primary" id="submitNewBtn">Submit for Approval</button>
    </div>
  `;

  renderItemsBody();

  document.getElementById("addItemBtn").onclick = () => {
    draftItems.push({ key: uid4(), itemId: "", customName: "", qty: "", price: "", unitRefPrice: null, purpose: "" });
    renderItemsBody();
  };
  document.getElementById("cancelNewBtn").onclick = () => { draftItems = []; currentView = "dashboard"; renderShell(); };
  document.getElementById("submitNewBtn").onclick = submitNewChallan;
}

function renderItemsBody() {
  const tbody = document.getElementById("itemsBody");
  if (!tbody) return;
  tbody.innerHTML = draftItems.map((it, i) => `
    <tr data-key="${it.key}">
      <td class="srno">${i + 1}</td>
      <td>
        <select class="item-select">
          <option value="">— Type manually below —</option>
          ${itemMasterList.map(m => `<option value="${m.id}" ${it.itemId === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}
        </select>
        <input type="text" class="item-custom" placeholder="Item name" style="margin-top:6px; ${it.itemId ? "display:none;" : ""}" value="${esc(it.customName)}">
      </td>
      <td class="qty-col"><input type="text" class="item-qty" value="${esc(it.qty)}" placeholder="0"></td>
      <td class="price-col"><input type="text" class="item-price" value="${esc(it.price)}" placeholder="0"></td>
      <td><input type="text" class="item-purpose" value="${esc(it.purpose)}" placeholder="Purpose"></td>
      <td class="rm-col"><button class="icon-btn remove-item" title="Remove" type="button">✕</button></td>
    </tr>
  `).join("");

  tbody.querySelectorAll("tr").forEach(tr => {
    const key = tr.dataset.key;
    const row = draftItems.find(d => d.key === key);
    const sel = tr.querySelector(".item-select");
    const custom = tr.querySelector(".item-custom");
    sel.onchange = () => {
      row.itemId = sel.value;
      const chosen = itemMasterList.find(m => m.id === sel.value);
      row.customName = chosen ? chosen.name : row.customName;
      custom.style.display = sel.value ? "none" : "block";
      // Cache this item's unit reference price on the row, then compute
      // the line total (unit × qty). Still just a starting point — the
      // Est. Price box stays editable for today's actual price.
      if (chosen && chosen.refPrice !== undefined && chosen.refPrice !== "" && !isNaN(Number(chosen.refPrice))) {
        row.unitRefPrice = Number(chosen.refPrice);
        recalcLinePrice(row, tr);
      } else {
        row.unitRefPrice = null;
      }
    };
    custom.oninput = () => { row.customName = custom.value; };
    tr.querySelector(".item-qty").oninput = (e) => {
      row.qty = e.target.value;
      recalcLinePrice(row, tr);
    };
    tr.querySelector(".item-price").oninput = (e) => { row.price = e.target.value; };
    tr.querySelector(".item-purpose").oninput = (e) => { row.purpose = e.target.value; };
    tr.querySelector(".remove-item").onclick = () => {
      draftItems = draftItems.filter(d => d.key !== key);
      if (draftItems.length === 0) draftItems.push({ key: uid4(), itemId: "", customName: "", qty: "", price: "", unitRefPrice: null, purpose: "" });
      renderItemsBody();
    };
  });
}

function recalcLinePrice(row, tr) {
  if (row.unitRefPrice === null || row.unitRefPrice === undefined) return;
  const qtyNum = Number(row.qty);
  if (row.qty === "" || isNaN(qtyNum)) return;
  row.price = String(Math.round(row.unitRefPrice * qtyNum * 100) / 100);
  const priceInput = tr.querySelector(".item-price");
  if (priceInput) priceInput.value = row.price;
}

async function submitNewChallan() {
  const dept = document.getElementById("fDept").value.trim();
  const requestedByName = document.getElementById("fRequestedBy").value.trim();
  const items = draftItems
    .filter(it => (it.customName || "").trim())
    .map(it => ({
      name: it.customName.trim(),
      qty: it.qty.trim(),
      price: it.price.trim(),
      purpose: it.purpose.trim()
    }));

  if (!dept) return toast("Please enter a department.", true);
  if (items.length === 0) return toast("Add at least one item.", true);

  const btn = document.getElementById("submitNewBtn");
  btn.disabled = true; btn.textContent = "Submitting…";

  try {
    const challanNo = await getNextChallanNo();
    await addDoc(collection(db, "challans"), {
      challanNo,
      department: dept,
      requestedByName,
      requestedByUid: currentUser.uid,
      items,
      status: "pending_approval",
      managerApproval: null,
      purchase: null,
      createdAt: serverTimestamp()
    });
    draftItems = [];
    toast(`Requisition ${challanNo} submitted for approval.`);
    currentView = "dashboard";
    renderShell();
  } catch (e) {
    console.error(e);
    toast("Couldn't submit — please try again.", true);
    btn.disabled = false; btn.textContent = "Submit for Approval";
  }
}

async function getNextChallanNo() {
  const counterRef = doc(db, "counters", "challanNo");
  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? snap.data().value : 1000;
    const value = current + 1;
    tx.set(counterRef, { value }, { merge: true });
    return value;
  });
  return `RF-${next}`;
}

// ---------- render: detail ----------
function renderDetail() {
  const main = document.getElementById("mainArea");
  if (!main) return;
  const c = allChallans.find(x => x.id === selectedChallanId);
  if (!c) {
    main.innerHTML = `<div class="empty-state"><div>Requisition not found.</div></div>`;
    return;
  }
  const role = currentUser.role;
  const canCancel = (role === "manager" || role === "admin") && (c.status === "pending_approval" || c.status === "approved");

  main.innerHTML = `
    <button class="btn btn-ghost" id="backBtn" style="margin-bottom:16px;">← Back to Dashboard</button>

    <div class="detail-header">
      <div class="title-block">
        <div class="challan-no">${esc(c.challanNo)}</div>
        <div class="meta">${esc(c.department)} · Requested by ${esc(c.requestedByName)} · ${fmtDate(c.createdAt)}</div>
      </div>
      <span class="stamp large ${STATUS_STAMP_CLASS[c.status]}">${STATUS_LABEL[c.status]}</span>
    </div>

    <div class="section-head"><span class="num">02</span><h2>Items Requested</h2><span class="hi">अनुरोधित वस्तुएं</span></div>
    <div class="card">
      <table class="items-table">
        <thead><tr><th>#</th><th>Item</th><th class="qty-col">Qty</th><th class="price-col">Est. Price</th><th>Purpose</th></tr></thead>
        <tbody>
          ${(c.items || []).map((it, i) => `
            <tr>
              <td class="srno">${i + 1}</td>
              <td>${esc(it.name)}</td>
              <td>${esc(it.qty)}</td>
              <td>${fmtMoney(it.price)}</td>
              <td>${esc(it.purpose)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>

    <div class="section-head"><span class="num">03</span><h2>Manager Approval</h2><span class="hi">मैनेजर की स्वीकृति</span></div>
    <div class="card" id="approvalCard"></div>

    ${(c.status === "approved" || c.status === "purchased") ? `
      <div class="section-head"><span class="num">04</span><h2>Accounts / Payment</h2><span class="hi">क्रय पूर्णता</span></div>
      <div class="card" id="purchaseCard"></div>
    ` : ""}

    ${c.status === "cancelled" ? `
      <div class="card" style="text-align:center;color:var(--ink-soft);">
        Cancelled by ${esc(c.cancelledByName || "—")} on ${fmtDate(c.cancelledAt)}${c.cancelReason ? " — " + esc(c.cancelReason) : ""}
      </div>
    ` : ""}

    <div class="toolbar">
      ${canCancel ? `<button class="btn btn-red" id="cancelReqBtn">Cancel Requisition</button>` : ""}
      <button class="btn btn-ghost" id="printBtn">🖨 Print / Download PDF</button>
    </div>

    <div class="print-only" id="printArea"></div>
  `;

  document.getElementById("backBtn").onclick = () => { currentView = "dashboard"; renderShell(); };
  document.getElementById("printBtn").onclick = () => { renderPrintable(c); window.print(); };
  const cancelBtn = document.getElementById("cancelReqBtn");
  if (cancelBtn) cancelBtn.onclick = () => cancelChallan(c.id);

  renderApprovalCard(c);
  if (c.status === "approved" || c.status === "purchased") renderPurchaseCard(c);
}

async function cancelChallan(challanId) {
  if (!confirm("Cancel this requisition? This can't be undone.")) return;
  try {
    await updateDoc(doc(db, "challans", challanId), {
      status: "cancelled",
      cancelledByName: currentUser.name,
      cancelledByUid: currentUser.uid,
      cancelledAt: Timestamp.now()
    });
    toast("Requisition cancelled.");
  } catch (e) {
    console.error(e);
    toast("Couldn't cancel — please try again.", true);
  }
}

function renderApprovalCard(c) {
  const card = document.getElementById("approvalCard");
  if (!card) return;
  const role = currentUser.role;

  if (c.managerApproval) {
    const a = c.managerApproval;
    card.innerHTML = `
      <div class="kv-grid">
        <div class="kv"><div class="k">Decision</div><div class="v"><span class="stamp ${a.decision === "approved" ? "approved" : "rejected"}">${a.decision === "approved" ? "Approved" : "Rejected"}</span></div></div>
        <div class="kv"><div class="k">Manager Sign. &amp; Date</div><div class="v">${esc(a.byName)} · ${fmtDate(a.at)}</div></div>
      </div>
      ${a.note ? `<div class="kv" style="margin-top:12px;"><div class="k">Note</div><div class="v">${esc(a.note)}</div></div>` : ""}
    `;
    return;
  }

  if (role !== "manager" && role !== "admin") {
    card.innerHTML = `<div class="empty-state" style="padding:20px;">Awaiting manager review.</div>`;
    return;
  }
  if (c.status !== "pending_approval") {
    card.innerHTML = `<div class="empty-state" style="padding:20px;">Nothing to approve.</div>`;
    return;
  }

  card.innerHTML = `
    <div class="approval-box">
      <div class="field">
        <label>Note (optional)</label>
        <textarea id="approvalNote" placeholder="Any comments for this decision"></textarea>
      </div>
      <div class="approval-actions">
        <button class="btn btn-green" id="approveBtn">✓ Approve</button>
        <button class="btn btn-red" id="rejectBtn">✕ Reject</button>
      </div>
    </div>
  `;
  document.getElementById("approveBtn").onclick = () => decideApproval(c.id, "approved");
  document.getElementById("rejectBtn").onclick = () => decideApproval(c.id, "rejected");
}

async function decideApproval(challanId, decision) {
  const note = document.getElementById("approvalNote")?.value.trim() || "";
  try {
    await updateDoc(doc(db, "challans", challanId), {
      managerApproval: { decision, note, byName: currentUser.name, byUid: currentUser.uid, at: Timestamp.now() },
      status: decision === "approved" ? "approved" : "rejected"
    });
    toast(decision === "approved" ? "Requisition approved." : "Requisition rejected.");
  } catch (e) {
    console.error(e);
    toast("Couldn't save decision — please try again.", true);
  }
}

function renderPurchaseCard(c) {
  const card = document.getElementById("purchaseCard");
  if (!card) return;
  const role = currentUser.role;

  if (c.purchase) {
    const p = c.purchase;
    card.innerHTML = `
      <div class="kv-grid">
        <div class="kv"><div class="k">Purchased By</div><div class="v">${esc(p.purchasedByName)}</div></div>
        <div class="kv"><div class="k">Vendor / Shop</div><div class="v">${esc(p.vendor)}</div></div>
        <div class="kv"><div class="k">Bill / Invoice No.</div><div class="v">${esc(p.billNo)}</div></div>
        <div class="kv"><div class="k">Total Amount Paid</div><div class="v">${fmtMoney(p.amountPaid)}</div></div>
        <div class="kv"><div class="k">Bill Copy Attached</div><div class="v">${p.billAttached ? "Yes" : "No"}</div></div>
        <div class="kv"><div class="k">Date</div><div class="v">${fmtDate(p.at)}</div></div>
      </div>
    `;
    return;
  }

  if (role !== "purchase" && role !== "admin") {
    card.innerHTML = `<div class="empty-state" style="padding:20px;">Awaiting purchase.</div>`;
    return;
  }
  if (c.status !== "approved") {
    card.innerHTML = `<div class="empty-state" style="padding:20px;">Nothing to record yet.</div>`;
    return;
  }

  card.innerHTML = `
    <div class="grid-2">
      <div class="field"><label>Vendor / Shop Name</label><input id="pVendor" type="text"></div>
      <div class="field"><label>Bill / Invoice No.</label><input id="pBillNo" type="text"></div>
      <div class="field"><label>Total Amount Paid (₹)</label><input id="pAmount" type="text"></div>
      <div class="field">
        <label>Bill Copy Attached</label>
        <select id="pAttached"><option value="yes">Yes</option><option value="no">No</option></select>
      </div>
    </div>
    <button class="btn btn-primary" id="completePurchaseBtn" style="margin-top:8px;">Mark as Purchased</button>
  `;
  document.getElementById("completePurchaseBtn").onclick = () => completePurchase(c.id);
}

async function completePurchase(challanId) {
  const vendor = document.getElementById("pVendor").value.trim();
  const billNo = document.getElementById("pBillNo").value.trim();
  const amountPaid = document.getElementById("pAmount").value.trim();
  const billAttached = document.getElementById("pAttached").value === "yes";

  if (!vendor) return toast("Please enter the vendor/shop name.", true);

  try {
    await updateDoc(doc(db, "challans", challanId), {
      purchase: {
        purchasedByName: currentUser.name,
        purchasedByUid: currentUser.uid,
        vendor, billNo, amountPaid, billAttached,
        at: Timestamp.now()
      },
      status: "purchased"
    });
    toast("Purchase recorded.");
  } catch (e) {
    console.error(e);
    toast("Couldn't save — please try again.", true);
  }
}

// ---------- print view ----------
function renderPrintable(c) {
  const area = document.getElementById("printArea");
  const rows = (c.items || []).map((it, i) => `
    <tr><td>${i + 1}</td><td>${esc(it.name)}</td><td>${esc(it.qty)}</td><td>${fmtMoney(it.price)}</td><td>${esc(it.purpose)}</td></tr>
  `).join("");

  area.innerHTML = `
    <div class="p-header">
      <div class="rf">RF FACTORY</div>
      <div class="title">PURCHASE REQUISITION CHALLAN</div>
      <div class="hi">क्रय अनुरोध चालान</div>
    </div>

    <div class="p-section-title">1. Requisition Details <span class="hi-inline">अनुरोध विवरण</span></div>
    <table>
      <tr><td><b>Challan No.</b><br><span class="hi-inline">चालान नं.</span></td><td>${esc(c.challanNo)}</td>
          <td><b>Date</b><br><span class="hi-inline">दिनांक</span></td><td>${fmtDate(c.createdAt)}</td></tr>
      <tr><td><b>Department</b><br><span class="hi-inline">विभाग</span></td><td>${esc(c.department)}</td>
          <td><b>Requested By</b><br><span class="hi-inline">अनुरोधकर्ता</span></td><td>${esc(c.requestedByName)}</td></tr>
    </table>

    <div class="p-section-title">2. Items Requested <span class="hi-inline">अनुरोधित वस्तुएं</span></div>
    <table>
      <tr><th>Sr.</th><th>Item Description</th><th>Qty</th><th>Est. Price ₹</th><th>Purpose</th></tr>
      ${rows}
    </table>

    <div class="p-section-title">3. Manager Approval <span class="hi-inline">मैनेजर की स्वीकृति</span></div>
    <table>
      <tr>
        <td><b>Decision</b></td>
        <td>${c.managerApproval ? (c.managerApproval.decision === "approved" ? "Approved" : "Rejected") : "— Pending —"}</td>
        <td><b>Manager Sign. &amp; Date</b></td>
        <td>${c.managerApproval ? esc(c.managerApproval.byName) + " · " + fmtDate(c.managerApproval.at) : ""}</td>
      </tr>
    </table>

    <div class="p-section-title">4. Purchase Completion <span class="hi-inline">क्रय पूर्णता</span></div>
    <table>
      <tr><td><b>Purchased By</b></td><td>${c.purchase ? esc(c.purchase.purchasedByName) : ""}</td>
          <td><b>Vendor / Shop</b></td><td>${c.purchase ? esc(c.purchase.vendor) : ""}</td></tr>
      <tr><td><b>Bill / Invoice No.</b></td><td>${c.purchase ? esc(c.purchase.billNo) : ""}</td>
          <td><b>Total Amount Paid</b></td><td>${c.purchase ? fmtMoney(c.purchase.amountPaid) : ""}</td></tr>
      <tr><td><b>Bill Copy Attached</b></td><td colspan="3">${c.purchase ? (c.purchase.billAttached ? "Yes" : "No") : ""}</td></tr>
    </table>

    <p style="font-size:11px;color:#555;">Note: No purchase without Manager approval. Bill copy must be attached before filing.<br>
    <span class="hi-inline">नोट: मैनेजर की स्वीकृति के बिना कोई क्रय न करें। फाइल करने से पहले बिल कॉपी अवश्य लगाएं।</span></p>
  `;
}

// ---------- admin: users ----------
let editingUserId = null;

function renderAdminUsers() {
  const main = document.getElementById("mainArea");
  if (!main) return;
  main.innerHTML = `<div class="spinner"></div>`;

  if (unsubUsers) unsubUsers();
  unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
    const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    drawAdminUsers(users);
  });
}

function drawAdminUsers(users) {
  const main = document.getElementById("mainArea");
  if (!main || currentView !== "admin-users") return;
  main.innerHTML = `
    <div class="section-head"><h2>Manage Users</h2></div>

    <div class="card">
      <h3 style="margin-bottom:12px;">Add a new user</h3>
      <div id="addUserError"></div>
      <div class="grid-2">
        <div class="field"><label>Full Name</label><input id="nuName" type="text"></div>
        <div class="field"><label>Role</label>
          <select id="nuRole">
            <option value="staff">Staff</option>
            <option value="manager">Manager</option>
            <option value="purchase">Accounts</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div class="field">
          <label>Username</label>
          <input id="nuUsername" type="text" placeholder="e.g. ramesh (no spaces or @)" autocapitalize="none">
        </div>
        <div class="field"><label>Temporary Password</label><input id="nuPassword" type="text" placeholder="min. 6 characters"></div>
        <div class="field">
          <label>Department <span style="text-transform:none;font-weight:400;">(for Staff/Admin raising requisitions)</span></label>
          <input id="nuDept" type="text" placeholder="e.g. Kitchen, Packing, Maintenance">
        </div>
      </div>
      <button class="btn btn-primary" id="addUserBtn">Add User</button>
    </div>

    <div class="card">
      <table class="admin-table">
        <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Department</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${users.map(u => u.id === editingUserId ? `
            <tr data-uid="${u.id}">
              <td>${esc(u.name)}</td>
              <td>${esc(u.username || "—")}</td>
              <td><span class="role-tag ${u.role}">${ROLE_LABEL[u.role] || u.role}</span></td>
              <td><input type="text" class="edit-dept" value="${esc(u.department || "")}" style="width:140px;" placeholder="e.g. Kitchen"></td>
              <td>${u.active === false ? "Disabled" : "Active"}</td>
              <td style="white-space:nowrap;">
                <button class="btn btn-primary save-dept" data-uid="${u.id}">Save</button>
                <button class="btn btn-ghost cancel-dept-edit">Cancel</button>
              </td>
            </tr>
          ` : `
            <tr data-uid="${u.id}">
              <td>${esc(u.name)}</td>
              <td>${esc(u.username || "—")}</td>
              <td><span class="role-tag ${u.role}">${ROLE_LABEL[u.role] || u.role}</span></td>
              <td>${esc(u.department || "—")}</td>
              <td>${u.active === false ? "Disabled" : "Active"}</td>
              <td style="white-space:nowrap;">
                <button class="btn btn-ghost edit-dept-btn" data-uid="${u.id}">Edit Dept.</button>
                <button class="btn btn-ghost toggle-active" data-uid="${u.id}" data-active="${u.active !== false}">${u.active === false ? "Enable" : "Disable"}</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById("addUserBtn").onclick = addNewUser;
  main.querySelectorAll(".toggle-active").forEach(btn => {
    btn.onclick = async () => {
      const isActive = btn.dataset.active === "true";
      await updateDoc(doc(db, "users", btn.dataset.uid), { active: !isActive });
      toast(!isActive ? "User enabled." : "User disabled.");
    };
  });
  main.querySelectorAll(".edit-dept-btn").forEach(btn => {
    btn.onclick = () => { editingUserId = btn.dataset.uid; drawAdminUsers(users); };
  });
  main.querySelectorAll(".cancel-dept-edit").forEach(btn => {
    btn.onclick = () => { editingUserId = null; drawAdminUsers(users); };
  });
  main.querySelectorAll(".save-dept").forEach(btn => {
    btn.onclick = async () => {
      const tr = btn.closest("tr");
      const department = tr.querySelector(".edit-dept").value.trim();
      await updateDoc(doc(db, "users", btn.dataset.uid), { department });
      editingUserId = null;
      toast("Department updated.");
    };
  });
}

async function addNewUser() {
  const name = document.getElementById("nuName").value.trim();
  const role = document.getElementById("nuRole").value;
  const usernameRaw = document.getElementById("nuUsername").value.trim();
  const username = usernameRaw.toLowerCase();
  const password = document.getElementById("nuPassword").value;
  const department = document.getElementById("nuDept").value.trim();
  const errEl = document.getElementById("addUserError");
  errEl.innerHTML = "";

  if (!name || !username || password.length < 6) {
    errEl.innerHTML = `<div class="error-msg">Fill in name, username, and a password of at least 6 characters.</div>`;
    return;
  }
  if (!/^[a-z0-9._-]+$/.test(username)) {
    errEl.innerHTML = `<div class="error-msg">Username can only have letters, numbers, dots, underscores, or hyphens — no spaces or @.</div>`;
    return;
  }

  const btn = document.getElementById("addUserBtn");
  btn.disabled = true; btn.textContent = "Adding…";

  const syntheticEmail = username + "@" + FAKE_EMAIL_DOMAIN;

  // Use a secondary, isolated Firebase app instance so creating the new
  // account doesn't sign the current admin out of their own session.
  const secondary = initializeApp(firebaseConfig, "secondary-" + Date.now());
  const secondaryAuth = getAuth(secondary);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, syntheticEmail, password);
    await setDoc(doc(db, "users", cred.user.uid), { name, username, role, department, active: true, createdAt: serverTimestamp() });
    await signOut(secondaryAuth);
    toast(`${name} added as ${ROLE_LABEL[role]}.`);
    document.getElementById("nuName").value = "";
    document.getElementById("nuUsername").value = "";
    document.getElementById("nuPassword").value = "";
    document.getElementById("nuDept").value = "";
  } catch (e) {
    const msg = e.code === "auth/email-already-in-use" ? "That username is already taken." : friendlyAuthError(e);
    errEl.innerHTML = `<div class="error-msg">${esc(msg)}</div>`;
  } finally {
    await deleteApp(secondary);
    btn.disabled = false; btn.textContent = "Add User";
  }
}

// ---------- admin: item master ----------
let editingItemId = null;

function renderAdminItems() {
  const main = document.getElementById("mainArea");
  if (!main) return;
  main.innerHTML = `
    <div class="section-head"><h2>Manage Item List</h2></div>
    <div class="card">
      <div class="grid-2">
        <div class="field">
          <label>Item name</label>
          <input id="newItemName" type="text" placeholder="e.g. Cooking Oil (15L can)">
        </div>
        <div class="field">
          <label>Reference Price ₹ (optional)</label>
          <input id="newItemPrice" type="text" placeholder="e.g. 1800">
        </div>
      </div>
      <button class="btn btn-primary" id="addItemMasterBtn">Add Item</button>
      <div style="font-size:12px;color:var(--ink-faint);margin-top:10px;">
        This price just pre-fills the Est. Price box when someone raises a requisition — it can always be changed for that requisition since prices fluctuate.
      </div>
    </div>
    <div class="card">
      <table class="admin-table">
        <thead><tr><th>Item</th><th>Reference Price</th><th></th></tr></thead>
        <tbody id="itemMasterBody"></tbody>
      </table>
    </div>
  `;
  drawItemMasterRows();
  document.getElementById("addItemMasterBtn").onclick = async () => {
    const name = document.getElementById("newItemName").value.trim();
    const priceRaw = document.getElementById("newItemPrice").value.trim();
    if (!name) return toast("Enter an item name.", true);
    const data = { name };
    if (priceRaw !== "") data.refPrice = priceRaw;
    await addDoc(collection(db, "itemMaster"), data);
    document.getElementById("newItemName").value = "";
    document.getElementById("newItemPrice").value = "";
    toast("Item added.");
  };
}

function drawItemMasterRows() {
  const tbody = document.getElementById("itemMasterBody");
  if (!tbody) return;

  if (itemMasterList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="color:var(--ink-faint);">No items yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = itemMasterList.map(m => {
    if (m.id === editingItemId) {
      return `
        <tr data-id="${m.id}">
          <td><input type="text" class="edit-name" value="${esc(m.name)}" style="width:100%;"></td>
          <td><input type="text" class="edit-price" value="${esc(m.refPrice ?? "")}" placeholder="e.g. 1800" style="width:100px;"></td>
          <td style="white-space:nowrap;">
            <button class="btn btn-primary save-item" data-id="${m.id}">Save</button>
            <button class="btn btn-ghost cancel-edit">Cancel</button>
          </td>
        </tr>
      `;
    }
    return `
      <tr data-id="${m.id}">
        <td>${esc(m.name)}</td>
        <td>${m.refPrice !== undefined && m.refPrice !== "" ? fmtMoney(m.refPrice) : `<span style="color:var(--ink-faint);">— not set —</span>`}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-ghost edit-item" data-id="${m.id}">Edit</button>
          <button class="btn btn-ghost rm-item" data-id="${m.id}">Remove</button>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll(".edit-item").forEach(btn => {
    btn.onclick = () => { editingItemId = btn.dataset.id; drawItemMasterRows(); };
  });
  tbody.querySelectorAll(".cancel-edit").forEach(btn => {
    btn.onclick = () => { editingItemId = null; drawItemMasterRows(); };
  });
  tbody.querySelectorAll(".save-item").forEach(btn => {
    btn.onclick = async () => {
      const tr = btn.closest("tr");
      const name = tr.querySelector(".edit-name").value.trim();
      const priceRaw = tr.querySelector(".edit-price").value.trim();
      if (!name) return toast("Item name can't be empty.", true);
      const data = { name };
      data.refPrice = priceRaw === "" ? "" : priceRaw;
      await updateDoc(doc(db, "itemMaster", btn.dataset.id), data);
      editingItemId = null;
      toast("Item updated.");
    };
  });
  tbody.querySelectorAll(".rm-item").forEach(btn => {
    btn.onclick = async () => { await deleteDoc(doc(db, "itemMaster", btn.dataset.id)); toast("Item removed."); };
  });
}


