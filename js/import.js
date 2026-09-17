// ตัวช่วยนำเข้า Excel เงินเดือน: อัปโหลด -> ตรวจโครงสร้าง -> mapping -> validate -> preview -> ยืนยัน
const ImportWizard = (() => {
  const STEP_LABELS = ["1. อัปโหลด", "2. ตรวจโครงสร้าง", "3. Mapping คอลัมน์", "4. ตรวจสอบข้อมูล", "5. Preview", "6. เสร็จสิ้น"];

  let state = null;

  function freshState() {
    return {
      step: 1,
      filename: "",
      analysis: [],
      mapping: {}, // label -> { kind, key }
      year: new Date().getFullYear() + 543,
      month: new Date().getMonth() + 1,
      parsedRows: [], // {sheet, name, type, income:{}, deductions:{}, total_income, total_deduction, net_pay, errors:[]}
      templates: [],
    };
  }

  function render() {
    if (!state) state = freshState();
    const stepsEl = document.getElementById("wizardSteps");
    stepsEl.innerHTML = STEP_LABELS.map((label, i) => {
      const n = i + 1;
      const cls = n === state.step ? "active" : n < state.step ? "done" : "";
      return `<div class="wizard-step ${cls}">${label}</div>`;
    }).join("");

    const body = document.getElementById("wizardBody");
    if (state.step === 1) {
      body.innerHTML = renderStep1();
      document.getElementById("wFile").addEventListener("change", onFileChosen);
    } else if (state.step === 2) body.innerHTML = renderStep2();
    else if (state.step === 3) renderStep3(body);
    else if (state.step === 4) body.innerHTML = renderStep4();
    else if (state.step === 5) body.innerHTML = renderStep5();
    else if (state.step === 6) body.innerHTML = renderStep6();
  }

  function reset() {
    state = freshState();
    render();
  }

  async function cancelImport() {
    const ok = await UI.confirmDialog({
      title: "ยกเลิกการนำเข้าไฟล์นี้?",
      html: '<p style="text-align:left;">เริ่มใหม่ทั้งหมด ข้อมูลที่ยังไม่ได้กด "ยืนยันนำเข้าข้อมูล" จะยังไม่ถูกบันทึกอยู่แล้ว จึงยกเลิกได้อย่างปลอดภัย</p>',
      confirmText: "ยกเลิกการนำเข้า",
    });
    if (!ok) return;
    reset();
  }

  // ---------- Step 1: อัปโหลด ----------
  function renderStep1() {
    return `
      <h3 class="section-title">ขั้นตอนที่ 1: อัปโหลดไฟล์ Excel เงินเดือน</h3>
      <p class="section-sub">รองรับไฟล์ที่แต่ละชีทคือหนึ่งกอง/สำนัก (รูปแบบ งด.2)</p>
      <div class="grid grid-3">
        <div class="field"><label>ปี พ.ศ.</label><input id="wYear" type="number" value="${state.year}" step="1"/></div>
        <div class="field"><label>เดือน</label><select id="wMonth">${Array.from({ length: 12 }, (_, i) => i + 1)
          .map((m) => `<option value="${m}" ${m === state.month ? "selected" : ""}>${m}</option>`)
          .join("")}</select></div>
        <div class="field"><label>ไฟล์ Excel (.xlsx)</label><input id="wFile" type="file" accept=".xlsx,.xls"/></div>
      </div>
      <div class="helptext" id="wUploadStatus"></div>
      <div id="wFileActions" style="margin-top:8px;"></div>
      <div class="modal-foot" style="padding:16px 0 0 0;border:none;">
        <button class="btn btn-primary" id="wNext1" disabled onclick="ImportWizard.toStep2()">ถัดไป: ตรวจสอบโครงสร้าง</button>
      </div>
    `;
  }

  async function onFileChosen(e) {
    const file = e.target.files[0];
    const statusEl = document.getElementById("wUploadStatus");
    const actionsEl = document.getElementById("wFileActions");
    if (!file) return;
    statusEl.textContent = "กำลังอ่านไฟล์...";
    actionsEl.innerHTML = "";
    try {
      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(buf, { type: "array" });
      state.analysis = PayrollImport.analyzeWorkbook(workbook);
      state.filename = file.name;
      const okSheets = state.analysis.filter((a) => a.ok && a.rows.length > 0);
      statusEl.textContent = `อ่านไฟล์สำเร็จ: ${file.name} — พบ ${state.analysis.length} ชีท (ใช้งานได้ ${okSheets.length} ชีท)`;
      document.getElementById("wNext1").disabled = okSheets.length === 0;
      actionsEl.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="ImportWizard.clearFile()">✕ ไฟล์นี้ไม่ใช่ที่ต้องการ ยกเลิกแล้วเลือกใหม่</button>`;
    } catch (err) {
      statusEl.textContent = "อ่านไฟล์ไม่สำเร็จ: " + err.message;
    }
  }

  function clearFile() {
    state.analysis = [];
    state.filename = "";
    const fileInput = document.getElementById("wFile");
    if (fileInput) fileInput.value = "";
    document.getElementById("wUploadStatus").textContent = "";
    document.getElementById("wFileActions").innerHTML = "";
    document.getElementById("wNext1").disabled = true;
  }

  function toStep2() {
    state.year = Number(document.getElementById("wYear").value);
    state.month = Number(document.getElementById("wMonth").value);
    state.step = 2;
    render();
  }

  // ---------- Step 2: ตรวจสอบโครงสร้าง ----------
  function renderStep2() {
    const deptLabel = (a) => (a.departmentName !== a.sheetName ? `${a.departmentName}<br/><span class="helptext" style="margin:0;">ชื่อชีท: ${a.sheetName}</span>` : a.departmentName);
    const rowsHtml = state.analysis
      .map((a) => {
        if (!a.ok) return `<tr><td>${a.sheetName}</td><td colspan="3"><span class="badge badge-red">ข้ามชีทนี้</span> ${a.reason}</td></tr>`;
        return `<tr><td>${deptLabel(a)}</td><td><span class="badge badge-green">พร้อมใช้งาน</span></td><td>${a.columns.length} คอลัมน์</td><td>${a.rows.length} คน</td></tr>`;
      })
      .join("");
    return `
      <h3 class="section-title">ขั้นตอนที่ 2: ตรวจสอบโครงสร้างไฟล์</h3>
      <p class="section-sub">ไฟล์: ${state.filename} — งวด ${state.month}/${state.year}</p>
      <div class="table-scroll"><table><thead><tr><th>ชีท (กอง/สำนัก)</th><th>สถานะ</th><th>คอลัมน์ที่พบ</th><th>จำนวนแถวข้อมูล</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
      <div class="modal-foot" style="padding:16px 0 0 0;border:none;justify-content:space-between;">
        <button class="btn btn-danger" onclick="ImportWizard.cancelImport()">ยกเลิกการนำเข้านี้</button>
        <div style="display:flex;gap:10px;">
          <button class="btn btn-ghost" onclick="ImportWizard.toStep(1)">ย้อนกลับ</button>
          <button class="btn btn-primary" onclick="ImportWizard.toStep3()">ถัดไป: Mapping คอลัมน์</button>
        </div>
      </div>
    `;
  }

  // ---------- Step 3: Mapping ----------
  function collectColumns() {
    const seen = new Map();
    for (const a of state.analysis) {
      if (!a.ok) continue;
      for (const col of a.columns) {
        if (["identity_name", "identity_type", "identity_dept", "income_subtotal", "deduction_subtotal"].includes(col.kind)) continue;
        if (!seen.has(col.label)) seen.set(col.label, col);
      }
    }
    return Array.from(seen.values());
  }

  async function toStep3() {
    state.step = 3;
    render();
  }

  async function renderStep3(body) {
    const cols = collectColumns();
    for (const col of cols) {
      if (!state.mapping[col.label]) {
        const kind = ["income", "deduction", "net_pay"].includes(col.kind) ? col.kind : "ignore";
        state.mapping[col.label] = { kind, key: col.label };
      }
    }
    const { data: templates } = await sb.from("column_mapping_templates").select("id,name,mapping").order("created_at", { ascending: false });
    state.templates = templates || [];

    const kindOptions = (current) =>
      ["income", "deduction", "net_pay", "ignore"]
        .map((k) => {
          const labels = { income: "รายการรับ", deduction: "รายการหัก", net_pay: "รับสุทธิ", ignore: "ไม่นำเข้า" };
          return `<option value="${k}" ${k === current ? "selected" : ""}>${labels[k]}</option>`;
        })
        .join("");

    body.innerHTML = `
      <h3 class="section-title">ขั้นตอนที่ 3: Mapping คอลัมน์</h3>
      <p class="section-sub">ระบบตรวจพบคอลัมน์เหล่านี้จากไฟล์ — ยืนยัน/ปรับประเภทให้ถูกต้องก่อนบันทึก</p>
      ${
        state.templates.length
          ? `<div class="field"><label>โหลดแม่แบบ mapping ที่เคยบันทึกไว้</label>
        <select id="wTemplateSelect"><option value="">-- เลือกแม่แบบ --</option>${state.templates
          .map((t) => `<option value="${t.id}">${t.name}</option>`)
          .join("")}</select>
        <button class="btn btn-ghost btn-sm" style="margin-top:8px;" onclick="ImportWizard.loadTemplate()">ใช้แม่แบบนี้</button></div>`
          : ""
      }
      <div id="mappingList">
        ${cols
          .map(
            (col) => `<div class="mapping-row">
          <div><div>${col.label}</div><div class="src">พบใต้หมวด: ${col.groupLabel || "-"}</div></div>
          <select data-label="${col.label}" onchange="ImportWizard.updateMapping('${col.label}', this.value)">${kindOptions(state.mapping[col.label].kind)}</select>
        </div>`
          )
          .join("")}
      </div>
      <div class="field" style="margin-top:16px;"><label>บันทึกเป็นแม่แบบ (ไม่บังคับ)</label><input id="wTemplateName" placeholder="เช่น mapping มาตรฐานเทศบาล"/></div>
      <div class="modal-foot" style="padding:16px 0 0 0;border:none;justify-content:space-between;">
        <button class="btn btn-danger" onclick="ImportWizard.cancelImport()">ยกเลิกการนำเข้านี้</button>
        <div style="display:flex;gap:10px;">
          <button class="btn btn-ghost" onclick="ImportWizard.toStep(2)">ย้อนกลับ</button>
          <button class="btn btn-primary" onclick="ImportWizard.toStep4()">ถัดไป: ตรวจสอบข้อมูล</button>
        </div>
      </div>
    `;
  }

  function updateMapping(label, kind) {
    state.mapping[label].kind = kind;
  }

  function loadTemplate() {
    const id = document.getElementById("wTemplateSelect").value;
    const tpl = state.templates.find((t) => String(t.id) === id);
    if (!tpl) return;
    Object.assign(state.mapping, tpl.mapping);
    render();
  }

  // ---------- Step 4: Validate ----------
  function buildParsedRows() {
    const rows = [];
    for (const a of state.analysis) {
      if (!a.ok) continue;
      const nameCol = a.columns.find((c) => c.kind === "identity_name");
      const typeCol = a.columns.find((c) => c.kind === "identity_type");
      const incomeSubtotalCol = a.columns.find((c) => c.kind === "income_subtotal");
      const deductionSubtotalCol = a.columns.find((c) => c.kind === "deduction_subtotal");
      for (const raw of a.rows) {
        const errors = [];
        const name = nameCol ? raw[nameCol.label] : null;
        const type = typeCol ? raw[typeCol.label] : "";
        if (!name) errors.push("ไม่มีชื่อ-สกุล");
        if (!type) errors.push("ไม่มีประเภทพนักงาน");

        const income = {};
        const deductions = {};
        let netFromColumn = null;
        for (const [label, m] of Object.entries(state.mapping)) {
          if (!(label in raw)) continue;
          const val = PayrollImport.toNumber(raw[label]);
          if (m.kind === "income") income[m.key || label] = val;
          else if (m.kind === "deduction") deductions[m.key || label] = val;
          else if (m.kind === "net_pay") netFromColumn = val;
        }
        const total_income = Object.values(income).reduce((s, v) => s + v, 0);
        const total_deduction = Object.values(deductions).reduce((s, v) => s + v, 0);
        const computedNet = total_income - total_deduction;
        const net_pay = netFromColumn !== null ? netFromColumn : computedNet;
        if (netFromColumn !== null && Math.abs(netFromColumn - computedNet) > 1) {
          errors.push(`ยอดรับสุทธิไม่ตรง (ไฟล์ระบุ ${netFromColumn.toLocaleString()} แต่คำนวณได้ ${computedNet.toLocaleString()})`);
        }
        if (incomeSubtotalCol) {
          const fileTotal = PayrollImport.toNumber(raw[incomeSubtotalCol.label]);
          if (Math.abs(fileTotal - total_income) > 1) {
            errors.push(`ยอดรวมรายการรับไม่ตรง (ไฟล์ระบุ ${fileTotal.toLocaleString()} แต่รวมจากรายการย่อยได้ ${total_income.toLocaleString()})`);
          }
        }
        if (deductionSubtotalCol) {
          const fileTotal = PayrollImport.toNumber(raw[deductionSubtotalCol.label]);
          if (Math.abs(fileTotal - total_deduction) > 1) {
            errors.push(`ยอดรวมรายการหักไม่ตรง (ไฟล์ระบุ ${fileTotal.toLocaleString()} แต่รวมจากรายการย่อยได้ ${total_deduction.toLocaleString()})`);
          }
        }
        rows.push({ sheet: a.departmentName, name, type, income, deductions, total_income, total_deduction, net_pay, errors });
      }
    }
    // ตรวจซ้ำชื่อในกองเดียวกัน
    const seen = new Map();
    for (const r of rows) {
      const key = r.sheet + "||" + r.name;
      if (seen.has(key)) {
        r.errors.push("ชื่อซ้ำในกอง/สำนักเดียวกัน");
        seen.get(key).errors.push("ชื่อซ้ำในกอง/สำนักเดียวกัน");
      } else seen.set(key, r);
    }
    return rows;
  }

  function toStep4() {
    state.parsedRows = buildParsedRows();
    state.step = 4;
    render();
  }

  function renderStep4() {
    const okRows = state.parsedRows.filter((r) => r.errors.length === 0);
    const badRows = state.parsedRows.filter((r) => r.errors.length > 0);
    return `
      <h3 class="section-title">ขั้นตอนที่ 4: ตรวจสอบข้อมูล</h3>
      <div class="grid grid-3" style="margin-bottom:16px;">
        <div class="card"><div class="stat-num" style="color:var(--green-700);">${state.parsedRows.length}</div><div class="stat-label">แถวทั้งหมด</div></div>
        <div class="card"><div class="stat-num" style="color:var(--green-700);">${okRows.length}</div><div class="stat-label">พร้อมนำเข้า</div></div>
        <div class="card"><div class="stat-num" style="color:var(--red);">${badRows.length}</div><div class="stat-label">มีข้อผิดพลาด (จะไม่นำเข้า)</div></div>
      </div>
      ${
        badRows.length
          ? `<div class="table-scroll"><table><thead><tr><th>กอง/สำนัก</th><th>ชื่อ-สกุล</th><th>ปัญหาที่พบ</th></tr></thead><tbody>${badRows
              .map((r) => `<tr><td>${r.sheet}</td><td>${r.name || "-"}</td><td><span class="badge badge-red">${r.errors.join(", ")}</span></td></tr>`)
              .join("")}</tbody></table></div>`
          : '<p class="helptext">ไม่พบข้อผิดพลาด ✅</p>'
      }
      <div class="modal-foot" style="padding:16px 0 0 0;border:none;justify-content:space-between;">
        <button class="btn btn-danger" onclick="ImportWizard.cancelImport()">ยกเลิกการนำเข้านี้</button>
        <div style="display:flex;gap:10px;">
          <button class="btn btn-ghost" onclick="ImportWizard.toStep(3)">ย้อนกลับ</button>
          <button class="btn btn-primary" ${okRows.length === 0 ? "disabled" : ""} onclick="ImportWizard.toStep(5)">ถัดไป: Preview</button>
        </div>
      </div>
    `;
  }

  // ---------- Step 5: Preview ----------
  function renderStep5() {
    const okRows = state.parsedRows.filter((r) => r.errors.length === 0);
    return `
      <h3 class="section-title">ขั้นตอนที่ 5: Preview ก่อนบันทึกจริง</h3>
      <p class="section-sub">งวด ${state.month}/${state.year} — จะบันทึก ${okRows.length} รายการ</p>
      <div class="table-scroll" style="max-height:420px;"><table><thead><tr><th>กอง/สำนัก</th><th>ชื่อ-สกุล</th><th>ประเภท</th><th>รวมรับ</th><th>รวมหัก</th><th>รับสุทธิ</th></tr></thead><tbody>
        ${okRows
          .map(
            (r) => `<tr><td>${r.sheet}</td><td>${r.name}</td><td>${r.type}</td><td>${r.total_income.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td><td>${r.total_deduction.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td><td>${r.net_pay.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td></tr>`
          )
          .join("")}
      </tbody></table></div>
      <div class="modal-foot" style="padding:16px 0 0 0;border:none;justify-content:space-between;">
        <button class="btn btn-danger" onclick="ImportWizard.cancelImport()">ยกเลิกการนำเข้านี้</button>
        <div style="display:flex;gap:10px;">
          <button class="btn btn-ghost" onclick="ImportWizard.toStep(4)">ย้อนกลับ</button>
          <button class="btn btn-gold" id="wConfirmBtn" onclick="ImportWizard.confirmImport()">ยืนยันนำเข้าข้อมูล</button>
        </div>
      </div>
    `;
  }

  // ---------- Step 6: Confirm & Save ----------
  async function confirmImport() {
    const btn = document.getElementById("wConfirmBtn");
    btn.disabled = true;
    btn.textContent = "กำลังบันทึก...";
    try {
      const okRows = state.parsedRows.filter((r) => r.errors.length === 0);

      // 1) งวดเงินเดือน
      let { data: period } = await sb.from("payroll_periods").select("id").eq("year", state.year).eq("month", state.month).maybeSingle();
      if (!period) {
        const { data: inserted, error } = await sb
          .from("payroll_periods")
          .insert({ year: state.year, month: state.month, status: "confirmed", source_filename: state.filename, imported_by: AppState.user.id, imported_at: new Date().toISOString() })
          .select("id")
          .single();
        if (error) throw error;
        period = inserted;
      } else {
        await sb.from("payroll_periods").update({ status: "confirmed", source_filename: state.filename, imported_by: AppState.user.id, imported_at: new Date().toISOString() }).eq("id", period.id);
      }

      // 1.5) บันทึกประวัติการนำเข้าไว้ก่อน เพื่อเอา id ไปติดกับทุกแถวที่บันทึกในรอบนี้
      // (ทำให้ลบเฉพาะรายการของการนำเข้าครั้งนี้ได้ทีหลัง โดยไม่กระทบข้อมูลจากการนำเข้าครั้งอื่นในงวดเดียวกัน)
      const badCount = state.parsedRows.length - okRows.length;
      const { data: logRow, error: logError } = await sb
        .from("import_logs")
        .insert({
          payroll_period_id: period.id,
          filename: state.filename,
          row_count: state.parsedRows.length,
          error_count: badCount,
          status: badCount === 0 ? "success" : "partial",
          created_by: AppState.user.id,
        })
        .select("id")
        .single();
      if (logError) throw logError;
      const importLogId = logRow.id;

      // 2) กอง/สำนัก ที่ยังไม่มี
      const sheetNames = Array.from(new Set(okRows.map((r) => r.sheet)));
      const missing = sheetNames.filter((n) => !AppState.departments.some((d) => d.name === n));
      if (missing.length) {
        await sb.from("departments").insert(missing.map((name) => ({ name })));
        await loadDepartments();
      }
      const deptIdByName = new Map(AppState.departments.map((d) => [d.name, d.id]));

      // 3) พนักงาน: หา/สร้าง
      const { data: existingEmployees } = await sb.from("employees").select("id,full_name,department_id");
      const empKey = (name, deptId) => name + "||" + deptId;
      const empMap = new Map((existingEmployees || []).map((e) => [empKey(e.full_name, e.department_id), e.id]));

      const toCreate = [];
      for (const r of okRows) {
        const deptId = deptIdByName.get(r.sheet);
        const key = empKey(r.name, deptId);
        if (!empMap.has(key) && !toCreate.some((c) => empKey(c.full_name, c.department_id) === key)) {
          toCreate.push({ full_name: r.name, employee_type: r.type, department_id: deptId });
        }
      }
      if (toCreate.length) {
        const { data: created, error } = await sb.from("employees").insert(toCreate).select("id,full_name,department_id");
        if (error) throw error;
        for (const e of created) empMap.set(empKey(e.full_name, e.department_id), e.id);
      }

      // 4) บันทึกรายการเงินเดือน (upsert)
      const records = okRows.map((r) => {
        const deptId = deptIdByName.get(r.sheet);
        return {
          payroll_period_id: period.id,
          employee_id: empMap.get(empKey(r.name, deptId)),
          department_id: deptId,
          income: r.income,
          deductions: r.deductions,
          total_income: r.total_income,
          total_deduction: r.total_deduction,
          net_pay: r.net_pay,
          import_log_id: importLogId,
        };
      });
      const { error: recError } = await sb.from("payroll_records").upsert(records, { onConflict: "payroll_period_id,employee_id" });
      if (recError) throw recError;

      // 5) บันทึกแม่แบบ mapping ถ้าตั้งชื่อไว้
      const tplName = (document.getElementById("wTemplateName") || {}).value;
      if (tplName) {
        await sb.from("column_mapping_templates").insert({ name: tplName, mapping: state.mapping, created_by: AppState.user.id });
      }

      state.savedCount = okRows.length;
      state.step = 6;
      render();
    } catch (err) {
      UI.toast("บันทึกไม่สำเร็จ: " + err.message, true);
      btn.disabled = false;
      btn.textContent = "ยืนยันนำเข้าข้อมูล";
    }
  }

  function renderStep6() {
    return `
      <div style="text-align:center;padding:30px 10px;">
        <div style="font-size:44px;">✅</div>
        <h3 class="section-title">นำเข้าข้อมูลสำเร็จ</h3>
        <p class="section-sub">บันทึกข้อมูลเงินเดือนงวด ${state.month}/${state.year} จำนวน ${state.savedCount} รายการ</p>
        <div style="display:flex;gap:10px;justify-content:center;">
          <button class="btn btn-primary" onclick="UI.showView('dashboard')">ไปที่แดชบอร์ด</button>
          <button class="btn btn-ghost" onclick="ImportWizard.reset()">นำเข้าไฟล์อื่นต่อ</button>
        </div>
      </div>
    `;
  }

  function toStep(n) {
    state.step = n;
    render();
  }

  return { render, reset, cancelImport, onFileChosen, clearFile, toStep2, toStep3, toStep4, toStep, updateMapping, loadTemplate, confirmImport };
})();
