// สร้าง/ค้นหา/พิมพ์/ดาวน์โหลด PDF สลิปเงินเดือน (ขนาด A4)
const Slip = {
  periods: [],
  orgSettings: null,

  MONTH_NAMES: ["", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"],

  async render() {
    Slip.backToSearch();
    await Slip.loadPeriods();
  },

  async loadPeriods() {
    const { data } = await sb.from("payroll_periods").select("id,year,month").order("year", { ascending: false }).order("month", { ascending: false });
    Slip.periods = data || [];
    const periodSel = document.getElementById("slipPeriod");
    const prevValue = periodSel.value;
    periodSel.innerHTML = '<option value="">-- เลือกงวด --</option>' + Slip.periods.map((p) => `<option value="${p.id}">${p.month}/${p.year}</option>`).join("");
    if (prevValue) periodSel.value = prevValue;

    const deptSel = document.getElementById("slipDept");
    deptSel.innerHTML = '<option value="">ทั้งหมด</option>' + AppState.departments.map((d) => `<option value="${d.id}">${d.name}</option>`).join("");
  },

  onPeriodChange() {
    Slip.search();
  },

  async search() {
    const tbody = document.querySelector("#slipResultsTable tbody");
    const periodId = document.getElementById("slipPeriod").value;
    if (!periodId) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-soft);">เลือกงวดเงินเดือนเพื่อเริ่มค้นหา</td></tr>';
      return;
    }
    const deptId = document.getElementById("slipDept").value;
    const q = document.getElementById("slipSearch").value.trim();

    let query = sb.from("payroll_records").select("id,net_pay,employees(full_name,employee_type),departments(name)").eq("payroll_period_id", periodId).order("id");
    if (deptId) query = query.eq("department_id", deptId);
    const { data, error } = await query;
    if (error) {
      tbody.innerHTML = `<tr><td colspan="5">โหลดข้อมูลไม่สำเร็จ: ${error.message}</td></tr>`;
      return;
    }
    let rows = data || [];
    if (q) rows = rows.filter((r) => r.employees && r.employees.full_name.includes(q));
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-soft);">ไม่พบข้อมูล</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(
        (r) => `<tr>
        <td>${r.employees ? r.employees.full_name : "-"}</td>
        <td>${r.employees ? r.employees.employee_type : "-"}</td>
        <td>${r.departments ? r.departments.name : "-"}</td>
        <td>${Number(r.net_pay).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
        <td><button class="btn btn-primary btn-sm" onclick="Slip.view(${r.id})">ดูสลิป</button></td>
      </tr>`
      )
      .join("");
  },

  async view(recordId) {
    const { data: record, error } = await sb
      .from("payroll_records")
      .select("income,deductions,total_income,total_deduction,net_pay,payroll_periods(year,month),employees(full_name,employee_type),departments(name)")
      .eq("id", recordId)
      .single();
    if (error) return UI.toast(error.message, true);

    if (!Slip.orgSettings) {
      const { data: org } = await sb.from("org_settings").select("*").eq("id", 1).single();
      Slip.orgSettings = org;
    }

    document.getElementById("slipPage").innerHTML = Slip.renderHTML(record, Slip.orgSettings);
    document.getElementById("slipSearchCard").style.display = "none";
    document.getElementById("slipViewWrap").style.display = "block";
    window.scrollTo(0, 0);
  },

  backToSearch() {
    document.getElementById("slipSearchCard").style.display = "";
    document.getElementById("slipViewWrap").style.display = "none";
  },

  print() {
    window.print();
  },

  async downloadPdf() {
    const btn = document.getElementById("slipPdfBtn");
    const el = document.getElementById("slipPage").firstElementChild;
    if (!el) return;
    btn.disabled = true;
    btn.textContent = "กำลังสร้าง PDF...";
    try {
      await html2pdf()
        .set({
          margin: 0,
          filename: (el.dataset.filename || "สลิปเงินเดือน") + ".pdf",
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(el)
        .save();
    } catch (err) {
      UI.toast("สร้าง PDF ไม่สำเร็จ: " + err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "⬇ ดาวน์โหลด PDF";
    }
  },

  fmt(n) {
    return Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  renderHTML(record, org) {
    const p = record.payroll_periods || {};
    const emp = record.employees || {};
    const dept = record.departments || {};
    const incomeRows = Object.entries(record.income || {}).filter(([, v]) => Number(v) > 0);
    const deductionRows = Object.entries(record.deductions || {}).filter(([, v]) => Number(v) > 0);
    const monthLabel = `${Slip.MONTH_NAMES[p.month] || p.month} พ.ศ. ${p.year}`;

    const logoHtml = org && org.logo_url ? `<img src="${org.logo_url}" alt="โลโก้"/>` : `<div class="seal-fallback">${(org && org.org_name_short) || "ทม."}</div>`;
    const watermarkHtml = org && org.logo_url ? `<div class="slip-watermark"><img src="${org.logo_url}" alt=""/></div>` : "";

    const incomeHtml = incomeRows.length ? incomeRows.map(([label, v]) => `<tr><td>${label}</td><td>${Slip.fmt(v)}</td></tr>`).join("") : `<tr class="empty-row"><td colspan="2">- ไม่มีรายการ -</td></tr>`;
    const deductionHtml = deductionRows.length ? deductionRows.map(([label, v]) => `<tr><td>${label}</td><td>${Slip.fmt(v)}</td></tr>`).join("") : `<tr class="empty-row"><td colspan="2">- ไม่มีรายการ -</td></tr>`;

    const signatureBlock = `<div class="slip-sign">
        <div><div class="line">ผู้รับเงิน</div></div>
        <div><div class="line">${org && org.director_name ? org.director_name + (org.director_title ? "<br/>" + org.director_title : "") : "เจ้าหน้าที่การเงิน"}</div></div>
      </div>`;

    const filename = `สลิปเงินเดือน_${emp.full_name || ""}_${p.month}-${p.year}`.replace(/\s+/g, "");

    return `
      <div class="slip-page" data-filename="${filename}">
        ${watermarkHtml}
        <div class="slip-content">
          <div class="slip-letterhead">
            ${logoHtml}
            <div>
              <div class="org-name">${(org && org.org_name) || "เทศบาลเมืองศรีสัชนาลัย"}</div>
              <div class="org-sub">${(org && org.address) || ""}${org && org.phone ? " โทร. " + org.phone : ""}</div>
            </div>
          </div>
          <div class="slip-title">
            <h2>สลิปเงินเดือน</h2>
            <div class="period">ประจำเดือน ${monthLabel}</div>
          </div>
          <div class="slip-recipient">
            <div><span class="label">ชื่อ-สกุล:</span> ${emp.full_name || "-"}</div>
            <div><span class="label">ประเภท:</span> ${emp.employee_type || "-"}</div>
            <div><span class="label">กอง/สำนัก:</span> ${dept.name || "-"}</div>
            <div><span class="label">งวด:</span> ${p.month}/${p.year}</div>
          </div>
          <div class="slip-cols">
            <div>
              <div class="slip-section-label">รายการรับ</div>
              <table class="slip-table"><tbody>
                ${incomeHtml}
                <tr class="slip-totalrow"><td>รวมรายการรับ</td><td>${Slip.fmt(record.total_income)}</td></tr>
              </tbody></table>
            </div>
            <div>
              <div class="slip-section-label">รายการหัก</div>
              <table class="slip-table"><tbody>
                ${deductionHtml}
                <tr class="slip-totalrow"><td>รวมรายการหัก</td><td>${Slip.fmt(record.total_deduction)}</td></tr>
              </tbody></table>
            </div>
          </div>
          <div class="slip-net">
            <div class="lbl">เงินรับสุทธิ</div>
            <div class="amt">${Slip.fmt(record.net_pay)} บาท</div>
          </div>
          ${signatureBlock}
          <div class="slip-genat">ออกสลิปเมื่อ ${new Date().toLocaleString("th-TH")}</div>
        </div>
      </div>
    `;
  },
};
