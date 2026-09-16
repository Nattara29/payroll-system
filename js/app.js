// โครงหลักของแอป: ล็อกอิน, เมนู, แดชบอร์ด, บุคลากร, ประวัติการนำเข้า
const AppState = {
  user: null,
  profile: null,
  departments: [], // cache: [{id, name}]
  authMode: "login",
};

const MENU = [
  { id: "dashboard", label: "แดชบอร์ด" },
  { id: "import", label: "นำเข้าข้อมูลเงินเดือน" },
  { id: "employees", label: "บุคลากร" },
  { id: "slip", label: "สลิปเงินเดือน" },
  { id: "history", label: "ประวัติการนำเข้า" },
  { id: "settings", label: "ตั้งค่า" },
];

const UI = {
  toggleSidebar() {
    document.getElementById("sidebar").classList.toggle("open");
    document.getElementById("sidebarBackdrop").classList.toggle("active");
  },
  closeSidebar() {
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("sidebarBackdrop").classList.remove("active");
  },
  showView(id) {
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    document.getElementById("view-" + id).classList.add("active");
    document.querySelectorAll(".menu-item").forEach((m) => m.classList.toggle("active", m.dataset.id === id));
    const item = MENU.find((m) => m.id === id);
    document.getElementById("pageTitle").textContent = item ? item.label : "";
    UI.closeSidebar();
    if (id === "dashboard") Dashboard.load();
    if (id === "employees") Employees.search();
    if (id === "history") History.load();
    if (id === "settings") Settings.load();
    if (id === "slip") Slip.render();
    if (id === "import") ImportWizard.render();
  },
  toast(msg, isError) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.className = "toast show" + (isError ? " error" : "");
    setTimeout(() => (t.className = "toast"), 3200);
  },
  renderMenu() {
    const el = document.getElementById("menuList");
    el.innerHTML = MENU.map(
      (m) => `<div class="menu-item" data-id="${m.id}" onclick="UI.showView('${m.id}')"><span class="menu-label">${m.label}</span></div>`
    ).join("");
  },
};

const Auth = {
  toggleSignup(e) {
    e.preventDefault();
    AppState.authMode = AppState.authMode === "login" ? "signup" : "login";
    const card = document.querySelector(".auth-card");
    let nameField = document.getElementById("loginNameField");
    if (AppState.authMode === "signup") {
      document.querySelector(".auth-title").textContent = "สมัครใช้งาน";
      document.getElementById("toggleSignupLink").parentElement.firstChild.textContent = "มีบัญชีอยู่แล้ว? ";
      document.getElementById("toggleSignupLink").textContent = "เข้าสู่ระบบ";
      if (!nameField) {
        nameField = document.createElement("div");
        nameField.className = "field";
        nameField.id = "loginNameField";
        nameField.innerHTML = '<label>ชื่อ-สกุล</label><input id="loginName" placeholder="ชื่อของคุณ"/>';
        document.getElementById("loginEmail").closest(".field").before(nameField);
      }
    } else {
      document.querySelector(".auth-title").textContent = "ระบบเงินเดือนเทศบาล";
      document.getElementById("toggleSignupLink").parentElement.firstChild.textContent = "ยังไม่มีบัญชี? ";
      document.getElementById("toggleSignupLink").textContent = "สมัครใช้งาน";
      if (nameField) nameField.remove();
    }
  },
  showError(msg) {
    const el = document.getElementById("authError");
    el.textContent = msg;
    el.classList.add("show");
  },
  clearError() {
    document.getElementById("authError").classList.remove("show");
  },
  async login() {
    Auth.clearError();
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    if (!email || !password) return Auth.showError("กรอกอีเมลและรหัสผ่านให้ครบ");

    if (AppState.authMode === "signup") {
      const full_name = (document.getElementById("loginName") || {}).value || email;
      const { error } = await sb.auth.signUp({ email, password, options: { data: { full_name } } });
      if (error) return Auth.showError(error.message);
      UI.toast("สมัครสำเร็จ กำลังเข้าสู่ระบบ...");
    }
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return Auth.showError(error.message);
    await boot();
  },
  async logout() {
    await sb.auth.signOut();
    location.reload();
  },
};

const Dashboard = {
  async load() {
    const el = document.getElementById("dashStats");
    el.innerHTML = '<div class="card">กำลังโหลด...</div>';
    const [{ count: empCount }, { count: depCount }, { count: periodCount }] = await Promise.all([
      sb.from("employees").select("*", { count: "exact", head: true }).eq("active", true),
      sb.from("departments").select("*", { count: "exact", head: true }),
      sb.from("payroll_periods").select("*", { count: "exact", head: true }),
    ]);

    const stats = [
      { label: "จำนวนบุคลากรทั้งหมด", num: empCount || 0, grad: "var(--grad-1)" },
      { label: "จำนวนกอง/สำนัก", num: depCount || 0, grad: "var(--grad-2)" },
      { label: "งวดเงินเดือนที่นำเข้าแล้ว", num: periodCount || 0, grad: "var(--grad-3)" },
    ];
    el.innerHTML = stats
      .map(
        (s) => `<div class="stat-card" style="background:${s.grad}">
        <div class="stat-num">${s.num}</div>
        <div class="stat-label">${s.label}</div>
      </div>`
      )
      .join("");

    const { data: periods } = await sb
      .from("payroll_periods")
      .select("id,year,month,status,imported_at")
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .limit(6);

    const tbody = document.querySelector("#dashPeriodsTable tbody");
    if (!periods || periods.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-soft);">ยังไม่มีข้อมูลเงินเดือน — เริ่มที่เมนู "นำเข้าข้อมูลเงินเดือน"</td></tr>';
      return;
    }
    const rows = await Promise.all(
      periods.map(async (p) => {
        const { data: recs } = await sb.from("payroll_records").select("net_pay").eq("payroll_period_id", p.id);
        const count = recs ? recs.length : 0;
        const sum = recs ? recs.reduce((a, r) => a + Number(r.net_pay || 0), 0) : 0;
        return { p, count, sum };
      })
    );
    tbody.innerHTML = rows
      .map(
        ({ p, count, sum }) => `<tr>
        <td>${p.month}/${p.year}</td>
        <td><span class="badge ${p.status === "confirmed" ? "badge-green" : "badge-amber"}">${p.status === "confirmed" ? "ยืนยันแล้ว" : "ฉบับร่าง"}</span></td>
        <td>${count}</td>
        <td>${sum.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
        <td>${p.imported_at ? new Date(p.imported_at).toLocaleString("th-TH") : "-"}</td>
      </tr>`
      )
      .join("");
  },
};

const Employees = {
  async search() {
    const q = document.getElementById("empSearch").value.trim();
    let query = sb.from("employees").select("id,full_name,employee_type,active,departments(name)").order("full_name").limit(100);
    if (q) query = query.ilike("full_name", `%${q}%`);
    const { data, error } = await query;
    const tbody = document.querySelector("#empTable tbody");
    if (error) {
      tbody.innerHTML = `<tr><td colspan="5">โหลดข้อมูลไม่สำเร็จ: ${error.message}</td></tr>`;
      return;
    }
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-soft);">ไม่พบข้อมูล</td></tr>';
      return;
    }
    tbody.innerHTML = data
      .map(
        (e) => `<tr>
        <td>${e.full_name}</td>
        <td>${e.employee_type}</td>
        <td>${e.departments ? e.departments.name : "-"}</td>
        <td><span class="badge ${e.active ? "badge-green" : "badge-gray"}">${e.active ? "ปฏิบัติงาน" : "พ้นสภาพ"}</span></td>
        <td><button class="btn btn-ghost btn-sm" onclick="Employees.viewHistory(${e.id}, '${e.full_name.replace(/'/g, "")}')">ดูประวัติเงินเดือน</button></td>
      </tr>`
      )
      .join("");
  },
  async viewHistory(employeeId, name) {
    const { data, error } = await sb
      .from("payroll_records")
      .select("net_pay,total_income,total_deduction,payroll_periods(year,month)")
      .eq("employee_id", employeeId)
      .order("id", { ascending: false });
    if (error) return UI.toast(error.message, true);
    const rows = (data || [])
      .map(
        (r) => `<tr><td>${r.payroll_periods.month}/${r.payroll_periods.year}</td><td>${Number(r.total_income).toLocaleString("th-TH")}</td><td>${Number(r.total_deduction).toLocaleString("th-TH")}</td><td>${Number(r.net_pay).toLocaleString("th-TH")}</td></tr>`
      )
      .join("");
    UI.toast(`พบประวัติเงินเดือนของ ${name} จำนวน ${(data || []).length} งวด`);
    alert(
      `ประวัติเงินเดือน: ${name}\n\n` +
        (data || [])
          .map((r) => `${r.payroll_periods.month}/${r.payroll_periods.year}  รับสุทธิ ${Number(r.net_pay).toLocaleString("th-TH")} บาท`)
          .join("\n")
    );
  },
};

const History = {
  rows: [], // แคชแถวล่าสุดไว้ ใช้ตอนลบเพื่อไม่ต้องฝังชื่อไฟล์/งวดลงใน onclick โดยตรง

  async load() {
    const isAdmin = AppState.profile && AppState.profile.role === "admin";
    const { data, error } = await sb
      .from("import_logs")
      .select("id,filename,row_count,error_count,status,created_at,payroll_period_id,payroll_periods(year,month)")
      .order("created_at", { ascending: false });
    const tbody = document.querySelector("#historyTable tbody");
    if (error) {
      tbody.innerHTML = `<tr><td colspan="7">โหลดข้อมูลไม่สำเร็จ: ${error.message}</td></tr>`;
      return;
    }
    History.rows = data || [];
    if (History.rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-soft);">ยังไม่มีประวัติการนำเข้า</td></tr>';
      return;
    }
    tbody.innerHTML = History.rows
      .map((r) => {
        const periodLabel = r.payroll_periods ? r.payroll_periods.month + "/" + r.payroll_periods.year : "-";
        const deleteBtn = isAdmin ? `<button class="btn btn-danger btn-sm" onclick="History.deleteImport(${r.id})">ลบรายการนี้</button>` : "";
        return `<tr>
        <td>${new Date(r.created_at).toLocaleString("th-TH")}</td>
        <td>${r.filename || "-"}</td>
        <td>${periodLabel}</td>
        <td>${r.row_count}</td>
        <td>${r.error_count}</td>
        <td><span class="badge ${r.status === "success" ? "badge-green" : r.status === "partial" ? "badge-amber" : "badge-red"}">${r.status}</span></td>
        <td>${deleteBtn}</td>
      </tr>`;
      })
      .join("");
  },

  // ลบเฉพาะรายการเงินเดือนที่ "ยังเป็นของ" การนำเข้าครั้งนี้ (import_log_id ตรงกัน)
  // ถ้าคนไหนถูกเขียนทับด้วยการนำเข้าครั้งหลังไปแล้ว จะไม่ถูกลบ เพราะข้อมูลปัจจุบันเป็นของครั้งหลังแล้ว
  // งวดเงินเดือน (payroll_periods) จะไม่ถูกลบ แม้ว่าการนำเข้าครั้งอื่นในงวดเดียวกันจะยังอยู่
  async deleteImport(logId) {
    const row = History.rows.find((r) => r.id === logId);
    const periodLabel = row && row.payroll_periods ? row.payroll_periods.month + "/" + row.payroll_periods.year : "-";
    const filename = (row && row.filename) || "-";

    const { count } = await sb.from("payroll_records").select("*", { count: "exact", head: true }).eq("import_log_id", logId);
    const n = count || 0;
    const detail =
      n > 0
        ? `จะลบข้อมูลเงินเดือน ${n} คนที่ยังเป็นของการนำเข้าครั้งนี้อยู่ (คนที่ถูกเขียนทับด้วยการนำเข้าครั้งหลังไปแล้วจะไม่ถูกลบ)`
        : `การนำเข้านี้ไม่มีข้อมูลเงินเดือนที่ยังใช้งานอยู่แล้ว (ถูกเขียนทับด้วยการนำเข้าครั้งหลังไปหมดแล้ว) จะลบแค่ประวัตินี้ออก`;
    const ok = confirm(`ลบรายการนำเข้านี้?\n\nไฟล์: ${filename}\nงวด: ${periodLabel}\n\n${detail}\n\nข้อมูลบุคลากรจะไม่ถูกลบ การกระทำนี้ย้อนกลับไม่ได้`);
    if (!ok) return;

    const { error: delRecErr } = await sb.from("payroll_records").delete().eq("import_log_id", logId);
    if (delRecErr) return UI.toast("ลบไม่สำเร็จ: " + delRecErr.message, true);
    const { error: delLogErr } = await sb.from("import_logs").delete().eq("id", logId);
    if (delLogErr) return UI.toast("ลบไม่สำเร็จ: " + delLogErr.message, true);
    UI.toast("ลบรายการนำเข้าเรียบร้อยแล้ว");
    History.load();
  },
};

async function loadDepartments() {
  const { data } = await sb.from("departments").select("id,name").order("name");
  AppState.departments = data || [];
  return AppState.departments;
}

async function boot() {
  const { data } = await sb.auth.getSession();
  const session = data.session;
  if (!session) {
    document.getElementById("authScreen").style.display = "flex";
    document.getElementById("app").style.display = "none";
    return;
  }
  AppState.user = session.user;
  const { data: profile } = await sb.from("profiles").select("full_name,role").eq("id", session.user.id).single();
  AppState.profile = profile;
  document.getElementById("whoAmI").textContent = profile ? `${profile.full_name} (${profile.role === "admin" ? "ผู้ดูแลระบบ" : "เจ้าหน้าที่"})` : session.user.email;

  document.getElementById("authScreen").style.display = "none";
  document.getElementById("app").style.display = "flex";
  UI.renderMenu();
  await loadDepartments();
  const { data: orgSettings } = await sb.from("org_settings").select("*").eq("id", 1).single();
  applyOrgBranding(orgSettings);
  UI.showView("dashboard");
}

document.addEventListener("DOMContentLoaded", boot);
