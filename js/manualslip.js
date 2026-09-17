// สลิปเงินเดือน (Manual): จัดทำสลิปเองสำหรับกรณีจ่ายเพิ่มเติม/ตกเบิก แยกอิสระจากข้อมูลนำเข้า Excel
const ManualSlip = {
  employees: [],
  rows: [], // แคชรายการล่าสุดไว้ใช้ตอนลบ/ดูสลิป

  async render() {
    ManualSlip.backToList();
    ManualSlip.cancelForm();
    await ManualSlip.loadList();
  },

  async loadEmployeesForDatalist() {
    if (ManualSlip.employees.length) return;
    const { data } = await sb.from("employees").select("full_name,employee_type,departments(name)").order("full_name").limit(500);
    ManualSlip.employees = data || [];
    document.getElementById("manualEmpDatalist").innerHTML = ManualSlip.employees.map((e) => `<option value="${e.full_name}"></option>`).join("");
  },

  onNameChange() {
    const name = document.getElementById("mfName").value.trim();
    const match = ManualSlip.employees.find((e) => e.full_name === name);
    if (match) {
      document.getElementById("mfType").value = match.employee_type || "";
      document.getElementById("mfDept").value = match.departments ? match.departments.name : "";
    }
  },

  async loadList() {
    const isAdmin = AppState.profile && AppState.profile.role === "admin";
    const q = document.getElementById("manualSlipSearch").value.trim();
    let query = sb.from("manual_slips").select("id,employee_name,title,issue_date,net_pay").order("created_at", { ascending: false }).limit(100);
    if (q) query = query.ilike("employee_name", `%${q}%`);
    const { data, error } = await query;
    const tbody = document.querySelector("#manualSlipTable tbody");
    if (error) {
      tbody.innerHTML = `<tr><td colspan="5">โหลดข้อมูลไม่สำเร็จ: ${error.message}</td></tr>`;
      return;
    }
    ManualSlip.rows = data || [];
    if (ManualSlip.rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-soft);">ยังไม่มีสลิปที่จัดทำเอง</td></tr>';
      return;
    }
    tbody.innerHTML = ManualSlip.rows
      .map(
        (r) => `<tr>
        <td>${new Date(r.issue_date).toLocaleDateString("th-TH")}</td>
        <td>${r.employee_name}</td>
        <td>${r.title}</td>
        <td>${Number(r.net_pay).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-primary btn-sm" onclick="ManualSlip.view(${r.id})">ดูสลิป</button>
          ${isAdmin ? `<button class="btn btn-danger btn-sm" onclick="ManualSlip.deleteSlip(${r.id})">ลบ</button>` : ""}
        </td>
      </tr>`
      )
      .join("");
  },

  newForm() {
    document.getElementById("manualSlipListCard").style.display = "none";
    document.getElementById("manualSlipFormCard").style.display = "block";
    document.getElementById("mfName").value = "";
    document.getElementById("mfType").value = "";
    document.getElementById("mfDept").value = "";
    document.getElementById("mfTitle").value = "";
    document.getElementById("mfDate").value = new Date().toISOString().slice(0, 10);
    document.getElementById("mfNote").value = "";
    document.getElementById("mfIncomeRows").innerHTML = "";
    document.getElementById("mfDeductionRows").innerHTML = "";
    ManualSlip.addRow("income");
    ManualSlip.addRow("deduction");
    ManualSlip.recalcTotals();
    ManualSlip.loadEmployeesForDatalist();
  },

  cancelForm() {
    document.getElementById("manualSlipFormCard").style.display = "none";
    document.getElementById("manualSlipListCard").style.display = "block";
  },

  addRow(kind) {
    const containerId = kind === "income" ? "mfIncomeRows" : "mfDeductionRows";
    const container = document.getElementById(containerId);
    const row = document.createElement("div");
    row.className = "mapping-row";
    row.style.gridTemplateColumns = "1.4fr 1fr auto";
    row.innerHTML = `
      <input class="mf-row-label" placeholder="รายการ เช่น ${kind === "income" ? "เงินตกเบิก" : "ภาษีหัก ณ ที่จ่าย"}"/>
      <input class="mf-row-amount" type="number" step="0.01" placeholder="0.00"/>
      <button class="btn btn-ghost btn-sm" type="button">✕</button>
    `;
    row.querySelectorAll("input").forEach((el) => el.addEventListener("input", ManualSlip.recalcTotals));
    row.querySelector("button").addEventListener("click", () => {
      row.remove();
      ManualSlip.recalcTotals();
    });
    container.appendChild(row);
  },

  collectRows(containerId) {
    const rows = [];
    document.querySelectorAll(`#${containerId} .mapping-row`).forEach((row) => {
      const label = row.querySelector(".mf-row-label").value.trim();
      const amount = PayrollImport.toNumber(row.querySelector(".mf-row-amount").value);
      if (label && amount !== 0) rows.push([label, amount]);
    });
    return rows;
  },

  recalcTotals() {
    const income = ManualSlip.collectRows("mfIncomeRows");
    const deductions = ManualSlip.collectRows("mfDeductionRows");
    const totalIncome = income.reduce((s, [, v]) => s + v, 0);
    const totalDeduction = deductions.reduce((s, [, v]) => s + v, 0);
    const net = totalIncome - totalDeduction;
    document.getElementById("mfNetPreview").textContent = Slip.fmt(net) + " บาท";
  },

  async save() {
    const name = document.getElementById("mfName").value.trim();
    const title = document.getElementById("mfTitle").value.trim();
    if (!name) return UI.toast("กรุณากรอกชื่อ-สกุลผู้รับเงิน", true);
    if (!title) return UI.toast("กรุณากรอกหัวข้อ/เหตุผล", true);

    const incomeRows = ManualSlip.collectRows("mfIncomeRows");
    const deductionRows = ManualSlip.collectRows("mfDeductionRows");
    const income = Object.fromEntries(incomeRows);
    const deductions = Object.fromEntries(deductionRows);
    const total_income = incomeRows.reduce((s, [, v]) => s + v, 0);
    const total_deduction = deductionRows.reduce((s, [, v]) => s + v, 0);
    const net_pay = total_income - total_deduction;

    const match = ManualSlip.employees.find((e) => e.full_name === name);

    const btn = document.getElementById("mfSaveBtn");
    btn.disabled = true;
    const { data, error } = await sb
      .from("manual_slips")
      .insert({
        employee_name: name,
        employee_type: document.getElementById("mfType").value.trim() || (match ? match.employee_type : null),
        department_name: document.getElementById("mfDept").value.trim() || (match ? match.departments && match.departments.name : null),
        title,
        issue_date: document.getElementById("mfDate").value || new Date().toISOString().slice(0, 10),
        income,
        deductions,
        total_income,
        total_deduction,
        net_pay,
        note: document.getElementById("mfNote").value.trim() || null,
        created_by: AppState.user.id,
      })
      .select("id")
      .single();
    btn.disabled = false;
    if (error) return UI.toast("บันทึกไม่สำเร็จ: " + error.message, true);

    document.getElementById("manualSlipFormCard").style.display = "none";
    UI.toast("บันทึกสลิปเรียบร้อยแล้ว");
    await ManualSlip.view(data.id);
  },

  async view(id) {
    const { data: rec, error } = await sb.from("manual_slips").select("*").eq("id", id).single();
    if (error) return UI.toast(error.message, true);

    const org = await Slip.loadOrgSettings();
    const data = {
      fullName: rec.employee_name,
      employeeType: rec.employee_type,
      departmentName: rec.department_name,
      docTitle: "สลิปเงินเดือน (Manual)",
      subtitle: rec.title,
      metaLabel: "วันที่ออกสลิป:",
      metaValue: new Date(rec.issue_date).toLocaleDateString("th-TH"),
      income: rec.income,
      deductions: rec.deductions,
      total_income: rec.total_income,
      total_deduction: rec.total_deduction,
      net_pay: rec.net_pay,
      note: rec.note,
      filenameBase: `สลิปManual_${rec.employee_name}_${rec.issue_date}`.replace(/\s+/g, ""),
    };

    document.getElementById("manualSlipPage").innerHTML = Slip.renderHTML(data, org);
    document.getElementById("manualSlipListCard").style.display = "none";
    document.getElementById("manualSlipFormCard").style.display = "none";
    document.getElementById("manualSlipViewWrap").style.display = "block";
    window.scrollTo(0, 0);
  },

  backToList() {
    document.getElementById("manualSlipViewWrap").style.display = "none";
    document.getElementById("manualSlipFormCard").style.display = "none";
    document.getElementById("manualSlipListCard").style.display = "block";
  },

  downloadPdf() {
    return Slip.downloadPdf("manualSlipPage", "manualSlipPdfBtn");
  },

  async deleteSlip(id) {
    const row = ManualSlip.rows.find((r) => r.id === id);
    const label = row ? `${row.employee_name} — ${row.title}` : "รายการนี้";
    const ok = await UI.confirmDialog({
      title: "ลบสลิปนี้?",
      html: `<p style="text-align:left;"><b>${escapeHtml(label)}</b></p><p style="color:var(--text-soft);">การกระทำนี้ย้อนกลับไม่ได้</p>`,
      confirmText: "ลบ",
    });
    if (!ok) return;
    const { error } = await sb.from("manual_slips").delete().eq("id", id);
    if (error) return UI.toast("ลบไม่สำเร็จ: " + error.message, true);
    UI.toast("ลบสลิปเรียบร้อยแล้ว");
    ManualSlip.loadList();
  },
};
