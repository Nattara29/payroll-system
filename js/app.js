// โครงหลักของแอป: ล็อกอิน, เมนู, แดชบอร์ด, บุคลากร, ประวัติการนำเข้า
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const AppState = {
  user: null,
  profile: null,
  departments: [], // cache: [{id, name}]
  authMode: "login",
};

const MENU = [
  { id: "dashboard", label: "แดชบอร์ด" },
  { id: "import", label: "นำเข้าข้อมูลเงินเดือน", adminOnly: true },
  { id: "employees", label: "บุคลากร" },
  { id: "slip", label: "สลิปเงินเดือน" },
  { id: "manualslip", label: "สลิปเงินเดือน (Manual)" },
  { id: "history", label: "ประวัติการนำเข้า" },
  { id: "profile", label: "โปรไฟล์ของฉัน" },
  { id: "settings", label: "ตั้งค่า", adminOnly: true },
  { id: "users", label: "จัดการผู้ใช้งาน", adminOnly: true },
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
    if (id === "users") Users.load();
    if (id === "profile") Profile.load();
    if (id === "slip") Slip.render();
    if (id === "manualslip") ManualSlip.render();
    if (id === "import") ImportWizard.render();
  },
  toast(msg, isError) {
    Swal.fire({
      toast: true,
      position: "top-end",
      icon: isError ? "error" : "success",
      title: msg,
      showConfirmButton: false,
      timer: 3200,
      timerProgressBar: true,
      didOpen: (el) => {
        el.addEventListener("mouseenter", Swal.stopTimer);
        el.addEventListener("mouseleave", Swal.resumeTimer);
      },
    });
  },
  // กล่องยืนยันสวย ๆ แทน confirm() ของเบราว์เซอร์ — คืนค่า true ถ้ากด "ยืนยัน/ลบ"
  async confirmDialog({ title, html, confirmText = "ยืนยัน", danger = true }) {
    const result = await Swal.fire({
      icon: "warning",
      title,
      html,
      showCancelButton: true,
      confirmButtonText: confirmText,
      cancelButtonText: "ยกเลิก",
      confirmButtonColor: danger ? "#c94430" : "#155c39",
      cancelButtonColor: "#8aa08f",
      reverseButtons: true,
      focusCancel: danger,
    });
    return result.isConfirmed;
  },
  renderMenu() {
    const isAdmin = AppState.profile && AppState.profile.role === "admin";
    const el = document.getElementById("menuList");
    el.innerHTML = MENU.filter((m) => !m.adminOnly || isAdmin)
      .map((m) => `<div class="menu-item" data-id="${m.id}" onclick="UI.showView('${m.id}')"><span class="menu-label">${m.label}</span></div>`)
      .join("");
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
      document.getElementById("authSignupNotice").style.display = "block";
      document.getElementById("authSubmitBtn").textContent = "สมัครใช้งาน";
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
      document.getElementById("authSignupNotice").style.display = "none";
      document.getElementById("authSubmitBtn").textContent = "เข้าสู่ระบบ";
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
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name } } });
      if (error) return Auth.showError(error.message);
      if (!data.session) {
        // โปรเจกต์นี้บังคับยืนยันอีเมลก่อนเข้าสู่ระบบ (ค่าเริ่มต้นของ Supabase)
        return Auth.showSignupSuccess(email);
      }
      // ถ้าปิด "Confirm email" ไว้ที่ Supabase, signUp จะให้ session มาทันที เข้าสู่ระบบได้เลย
      UI.toast("สมัครสำเร็จ กำลังเข้าสู่ระบบ...");
      return boot();
    }
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return Auth.showError(error.message);
    await boot();
  },
  showSignupSuccess(email) {
    document.getElementById("authFormFields").style.display = "none";
    document.getElementById("authSignupEmail").textContent = email;
    document.getElementById("authSignupSuccess").style.display = "block";
  },
  backToLoginAfterSignup() {
    document.getElementById("authSignupSuccess").style.display = "none";
    document.getElementById("authFormFields").style.display = "block";
    AppState.authMode = "login";
    document.querySelector(".auth-title").textContent = "ระบบเงินเดือนเทศบาล";
    document.getElementById("toggleSignupLink").parentElement.firstChild.textContent = "ยังไม่มีบัญชี? ";
    document.getElementById("toggleSignupLink").textContent = "สมัครใช้งาน";
    document.getElementById("authSignupNotice").style.display = "none";
    document.getElementById("authSubmitBtn").textContent = "เข้าสู่ระบบ";
    const nameField = document.getElementById("loginNameField");
    if (nameField) nameField.remove();
    document.getElementById("loginPassword").value = "";
  },
  async logout() {
    await sb.auth.signOut();
    location.reload();
  },
};

// ไอคอนเส้น (outline) แบบเรียบง่าย วาดเองด้วย SVG ไม่พึ่งไลบรารีไอคอนภายนอก
const DASH_ICONS = {
  users: '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  building: '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><rect height="18" rx="1" width="16" x="4" y="3"/><path d="M9 21v-4h6v4"/><path d="M8 7h1M12 7h1M16 7h1M8 11h1M12 11h1M16 11h1"/></svg>',
  calendar: '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><rect height="16" rx="2" width="18" x="3" y="5"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="m9 16 2 2 4-4"/></svg>',
  wallet: '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/><path d="M21 12h-4a2 2 0 0 0 0 4h4v-4Z"/></svg>',
};

// วาดกราฟแท่งแนวนอนแบบง่าย (ไม่มีไลบรารีกราฟ) จากรายการ [ชื่อ, ค่า] ที่เรียงมากไปน้อยแล้ว
function renderBarList(entries, formatValue) {
  if (entries.length === 0) return '<p class="dash-empty">ยังไม่มีข้อมูล</p>';
  const max = entries[0][1] || 1;
  return entries
    .map(
      ([label, val]) => `<div class="bar-row">
        <div class="bar-label" title="${escapeHtml(label)}">${escapeHtml(label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max((val / max) * 100, val > 0 ? 2 : 0)}%"></div></div>
        <div class="bar-value">${formatValue(val)}</div>
      </div>`
    )
    .join("");
}

const Dashboard = {
  async load() {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "สวัสดีตอนเช้า" : hour < 17 ? "สวัสดีตอนบ่าย" : "สวัสดีตอนเย็น";
    const name = AppState.profile ? AppState.profile.full_name : "";
    document.getElementById("dashGreeting").innerHTML = `
      <div class="dash-hello">${greeting}${name ? ", " + escapeHtml(name) : ""}</div>
      <div class="dash-date">${new Date().toLocaleDateString("th-TH", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>`;

    const el = document.getElementById("dashStats");
    el.innerHTML = '<div class="card">กำลังโหลด...</div>';

    const [{ count: empCount }, { count: depCount }, { count: periodCount }, { data: empTypeRows }] = await Promise.all([
      sb.from("employees").select("*", { count: "exact", head: true }).eq("active", true),
      sb.from("departments").select("*", { count: "exact", head: true }),
      sb.from("payroll_periods").select("*", { count: "exact", head: true }),
      sb.from("employees").select("employee_type").eq("active", true),
    ]);

    const typeCounts = {};
    (empTypeRows || []).forEach((e) => {
      const t = e.employee_type || "ไม่ระบุประเภท";
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    });
    const typeEntries = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
    document.getElementById("dashTypeChart").innerHTML = renderBarList(typeEntries, (v) => v.toLocaleString("th-TH") + " คน");

    const { data: periods } = await sb
      .from("payroll_periods")
      .select("id,year,month,status,imported_at")
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .limit(6);

    const tbody = document.querySelector("#dashPeriodsTable tbody");
    const deptChartEl = document.getElementById("dashDeptChart");
    const deptChartSubEl = document.getElementById("dashDeptChartSub");

    if (!periods || periods.length === 0) {
      const stats = [
        { label: "จำนวนบุคลากรทั้งหมด", num: (empCount || 0).toLocaleString("th-TH"), grad: "var(--grad-1)", icon: DASH_ICONS.users },
        { label: "จำนวนกอง/สำนัก", num: (depCount || 0).toLocaleString("th-TH"), grad: "var(--grad-2)", icon: DASH_ICONS.building },
        { label: "งวดเงินเดือนที่นำเข้าแล้ว", num: "0", grad: "var(--grad-3)", icon: DASH_ICONS.calendar },
        { label: "ยอดจ่ายสุทธิ งวดล่าสุด", num: "—", grad: "var(--grad-4)", icon: DASH_ICONS.wallet },
      ];
      el.innerHTML = stats
        .map((s) => `<div class="stat-card" style="background:${s.grad}"><div class="stat-icon">${s.icon}</div><div class="stat-num">${s.num}</div><div class="stat-label">${s.label}</div></div>`)
        .join("");
      deptChartSubEl.textContent = "ยังไม่มีงวดเงินเดือน";
      deptChartEl.innerHTML = '<p class="dash-empty">ยังไม่มีข้อมูลเงินเดือน</p>';
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-soft);">ยังไม่มีข้อมูลเงินเดือน — เริ่มที่เมนู "นำเข้าข้อมูลเงินเดือน"</td></tr>';
      return;
    }

    const rows = await Promise.all(
      periods.map(async (p) => {
        const { data: recs } = await sb.from("payroll_records").select("net_pay,departments(name)").eq("payroll_period_id", p.id);
        const count = recs ? recs.length : 0;
        const sum = recs ? recs.reduce((a, r) => a + Number(r.net_pay || 0), 0) : 0;
        return { p, count, sum, recs: recs || [] };
      })
    );
    const latest = rows[0];

    const stats = [
      { label: "จำนวนบุคลากรทั้งหมด", num: (empCount || 0).toLocaleString("th-TH"), grad: "var(--grad-1)", icon: DASH_ICONS.users },
      { label: "จำนวนกอง/สำนัก", num: (depCount || 0).toLocaleString("th-TH"), grad: "var(--grad-2)", icon: DASH_ICONS.building },
      { label: "งวดเงินเดือนที่นำเข้าแล้ว", num: (periodCount || 0).toLocaleString("th-TH"), grad: "var(--grad-3)", icon: DASH_ICONS.calendar },
      { label: `ยอดจ่ายสุทธิ งวด ${latest.p.month}/${latest.p.year}`, num: latest.sum.toLocaleString("th-TH", { maximumFractionDigits: 0 }) + " ฿", grad: "var(--grad-4)", icon: DASH_ICONS.wallet },
    ];
    el.innerHTML = stats
      .map((s) => `<div class="stat-card" style="background:${s.grad}"><div class="stat-icon">${s.icon}</div><div class="stat-num">${s.num}</div><div class="stat-label">${s.label}</div></div>`)
      .join("");

    const byDept = {};
    latest.recs.forEach((r) => {
      const name = r.departments ? r.departments.name : "ไม่ระบุกอง/สำนัก";
      byDept[name] = (byDept[name] || 0) + Number(r.net_pay || 0);
    });
    const deptEntries = Object.entries(byDept).sort((a, b) => b[1] - a[1]);
    deptChartSubEl.textContent = `งวด ${latest.p.month}/${latest.p.year}`;
    deptChartEl.innerHTML = renderBarList(deptEntries, (v) => v.toLocaleString("th-TH", { maximumFractionDigits: 0 }));

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
    Swal.fire({
      title: `ประวัติเงินเดือน: ${name}`,
      html:
        (data || []).length === 0
          ? '<p style="color:var(--text-soft);">ยังไม่มีประวัติเงินเดือน</p>'
          : `<div class="table-scroll" style="max-height:340px;text-align:left;">
              <table><thead><tr><th>งวด</th><th>รวมรับ</th><th>รวมหัก</th><th>รับสุทธิ</th></tr></thead><tbody>${rows}</tbody></table>
            </div>`,
      confirmButtonText: "ปิด",
      confirmButtonColor: "#155c39",
      width: 480,
    });
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
  // งวดเงินเดือน (payroll_periods) จะไม่ถูกลบ ถ้ายังมีข้อมูล/การนำเข้าอื่นอยู่ในงวดเดียวกัน
  // แต่ถ้าลบแล้วงวดนั้นว่างเปล่าสนิท (ไม่มีข้อมูลเงินเดือนและไม่มีประวัตินำเข้าเหลือเลย) จะลบงวดที่ว่างนั้นออกไปด้วย
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
    const ok = await UI.confirmDialog({
      title: "ลบรายการนำเข้านี้?",
      html: `<div style="text-align:left;font-size:14px;">
        <p><b>ไฟล์:</b> ${escapeHtml(filename)}<br/><b>งวด:</b> ${escapeHtml(periodLabel)}</p>
        <p>${escapeHtml(detail)}</p>
        <p style="color:var(--text-soft);">ข้อมูลบุคลากรจะไม่ถูกลบ การกระทำนี้ย้อนกลับไม่ได้</p>
      </div>`,
      confirmText: "ลบ",
    });
    if (!ok) return;

    const { error: delRecErr } = await sb.from("payroll_records").delete().eq("import_log_id", logId);
    if (delRecErr) return UI.toast("ลบไม่สำเร็จ: " + delRecErr.message, true);
    const { error: delLogErr } = await sb.from("import_logs").delete().eq("id", logId);
    if (delLogErr) return UI.toast("ลบไม่สำเร็จ: " + delLogErr.message, true);

    // ถ้างวดนี้ไม่มีทั้งการนำเข้าและข้อมูลเงินเดือนเหลืออยู่เลย ให้ลบงวดที่ว่างเปล่านั้นออกด้วย
    // ป้องกันไม่ให้เหลืองวดค้างอยู่ในเมนูสลิปเงินเดือน/รายชื่อบุคลากรทั้งที่ไม่มีข้อมูลแล้ว
    const periodId = row && row.payroll_period_id;
    if (periodId) {
      const [{ count: remainingRecords }, { count: remainingLogs }] = await Promise.all([
        sb.from("payroll_records").select("*", { count: "exact", head: true }).eq("payroll_period_id", periodId),
        sb.from("import_logs").select("*", { count: "exact", head: true }).eq("payroll_period_id", periodId),
      ]);
      if (!remainingRecords && !remainingLogs) {
        await sb.from("payroll_periods").delete().eq("id", periodId);
      }
    }

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
  const { data: profile } = await sb.from("profiles").select("full_name,role,active").eq("id", session.user.id).single();
  AppState.profile = profile;

  if (profile && !profile.active) {
    await sb.auth.signOut();
    document.getElementById("authScreen").style.display = "flex";
    document.getElementById("app").style.display = "none";
    Auth.showError("บัญชีนี้ถูกปิดใช้งานแล้ว กรุณาติดต่อผู้ดูแลระบบ");
    return;
  }

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
