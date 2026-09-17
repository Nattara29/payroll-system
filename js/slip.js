// สร้าง/ค้นหา/พิมพ์/ดาวน์โหลด PDF สลิปเงินเดือน (ขนาด A4)
const Slip = {
  periods: [],
  orgSettings: null,

  MONTH_NAMES: ["", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"],
  RECORD_SELECT: "income,deductions,total_income,total_deduction,net_pay,payroll_periods(year,month),employees(full_name,employee_type),departments(name)",
  PDF_OPTS: {
    margin: 0,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: "avoid-all" },
  },

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
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-soft);">เลือกงวดเงินเดือนเพื่อเริ่มค้นหา</td></tr>';
      Slip.updateSelectionUI();
      return;
    }
    const deptId = document.getElementById("slipDept").value;
    const q = document.getElementById("slipSearch").value.trim();

    let query = sb.from("payroll_records").select("id,net_pay,employees(full_name,employee_type),departments(name)").eq("payroll_period_id", periodId).order("id");
    if (deptId) query = query.eq("department_id", deptId);
    const { data, error } = await query;
    if (error) {
      tbody.innerHTML = `<tr><td colspan="6">โหลดข้อมูลไม่สำเร็จ: ${error.message}</td></tr>`;
      Slip.updateSelectionUI();
      return;
    }
    let rows = data || [];
    if (q) rows = rows.filter((r) => r.employees && r.employees.full_name.includes(q));
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-soft);">ไม่พบข้อมูล</td></tr>';
      Slip.updateSelectionUI();
      return;
    }
    tbody.innerHTML = rows
      .map(
        (r) => `<tr>
        <td><input class="slip-row-check" data-id="${r.id}" onchange="Slip.onRowCheck()" type="checkbox"/></td>
        <td>${r.employees ? r.employees.full_name : "-"}</td>
        <td>${r.employees ? r.employees.employee_type : "-"}</td>
        <td>${r.departments ? r.departments.name : "-"}</td>
        <td>${Number(r.net_pay).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
        <td><button class="btn btn-primary btn-sm" onclick="Slip.view(${r.id})">ดูสลิป</button></td>
      </tr>`
      )
      .join("");
    Slip.updateSelectionUI();
  },

  // เลือกทั้งหมด/ยกเลิกทั้งหมดในตารางผลค้นหาปัจจุบัน
  toggleSelectAll(checked) {
    document.querySelectorAll(".slip-row-check").forEach((c) => (c.checked = checked));
    Slip.updateSelectionUI();
  },

  onRowCheck() {
    Slip.updateSelectionUI();
  },

  // อัปเดตข้อความ "เลือกแล้ว N คน" + เปิด/ปิดปุ่ม + สถานะ checkbox "เลือกทั้งหมด"
  updateSelectionUI() {
    const all = document.querySelectorAll(".slip-row-check");
    const checked = document.querySelectorAll(".slip-row-check:checked");
    const countEl = document.getElementById("slipSelectedCount");
    const btn = document.getElementById("slipBulkPrintBtn");
    if (countEl) countEl.textContent = checked.length > 0 ? `เลือกแล้ว ${checked.length} คน` : "ยังไม่ได้เลือก";
    if (btn) btn.disabled = checked.length === 0;
    const selectAll = document.getElementById("slipSelectAll");
    if (selectAll) {
      selectAll.checked = all.length > 0 && checked.length === all.length;
      selectAll.indeterminate = checked.length > 0 && checked.length < all.length;
    }
  },

  async loadOrgSettings() {
    if (!Slip.orgSettings) {
      const { data: org } = await sb.from("org_settings").select("*").eq("id", 1).single();
      Slip.orgSettings = org;
    }
    return Slip.orgSettings;
  },

  // แปลงแถวข้อมูล payroll_records ที่ join มาแล้ว ให้เป็น shape กลางสำหรับ renderHTML()
  recordToSlipData(record) {
    const p = record.payroll_periods || {};
    const emp = record.employees || {};
    const dept = record.departments || {};
    const monthLabel = `${Slip.MONTH_NAMES[p.month] || p.month} พ.ศ. ${p.year}`;
    return {
      fullName: emp.full_name,
      employeeType: emp.employee_type,
      departmentName: dept.name,
      docTitle: "สลิปเงินเดือน",
      subtitle: `ประจำเดือน ${monthLabel}`,
      metaLabel: "งวด:",
      metaValue: `${p.month}/${p.year}`,
      income: record.income,
      deductions: record.deductions,
      total_income: record.total_income,
      total_deduction: record.total_deduction,
      net_pay: record.net_pay,
      filenameBase: `สลิปเงินเดือน_${emp.full_name || ""}_${p.month}-${p.year}`.replace(/\s+/g, ""),
    };
  },

  async view(recordId) {
    const { data: record, error } = await sb.from("payroll_records").select(Slip.RECORD_SELECT).eq("id", recordId).single();
    if (error) return UI.toast(error.message, true);

    const org = await Slip.loadOrgSettings();
    document.getElementById("slipPage").innerHTML = Slip.renderHTML(Slip.recordToSlipData(record), org);
    document.getElementById("slipSearchCard").style.display = "none";
    document.getElementById("slipViewWrap").style.display = "block";
    window.scrollTo(0, 0);
  },

  // ดูตัวอย่างสลิปของทุกคนที่ติ๊กเลือกไว้ในตารางค้นหา ต่อกันเป็นหลายหน้า (เพื่อพิมพ์/ดาวน์โหลดพร้อมกัน)
  // ถ้าเลือกไว้คนเดียวจะพาไปหน้าเดียวกับ "ดูสลิป" ปกติเลย
  async viewSelected() {
    const ids = Array.from(document.querySelectorAll(".slip-row-check:checked")).map((c) => Number(c.dataset.id));
    if (ids.length === 0) return;
    if (ids.length === 1) return Slip.view(ids[0]);

    const org = await Slip.loadOrgSettings();
    const { data: records, error } = await sb.from("payroll_records").select("id," + Slip.RECORD_SELECT).in("id", ids);
    if (error) return UI.toast(error.message, true);

    const byId = Object.fromEntries((records || []).map((r) => [r.id, r]));
    document.getElementById("slipPage").innerHTML = ids
      .map((id) => byId[id])
      .filter(Boolean)
      .map((record) => Slip.renderHTML(Slip.recordToSlipData(record), org))
      .join("");
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

  // สลิปเดียว: เหมือนเดิมทุกประการ (html2pdf แล้วลบหน้าว่างส่วนเกิน)
  // สลิปหลายใบ: สร้างเป็น PDF ไฟล์เดียวหน้าละ 1 ใบ โดยควบคุมการขึ้นหน้าเองแทนการเดาของ html2pdf
  async downloadPdf(pageContainerId, btnId) {
    pageContainerId = pageContainerId || "slipPage";
    btnId = btnId || "slipPdfBtn";
    const btn = document.getElementById(btnId);
    const pages = Array.from(document.getElementById(pageContainerId).children);
    if (pages.length === 0) return;
    if (pages.length === 1) return Slip.downloadSinglePdf(pages[0], btn);
    return Slip.downloadMultiPdf(pages, btn);
  },

  async downloadSinglePdf(el, btn) {
    btn.disabled = true;
    btn.textContent = "กำลังสร้าง PDF...";
    try {
      // สลิปออกแบบให้พอดี 1 หน้า A4 เสมอ (.slip-page สูงคงที่ 297mm) แต่ html2pdf บางครั้ง
      // ปัดเศษพิกเซลผิดพลาดจนสร้างหน้าที่ 2 ว่าง ๆ ตามมา จึงต้องลบหน้าเกินออกเองให้ชัวร์
      const worker = html2pdf()
        .set({ ...Slip.PDF_OPTS, filename: (el.dataset.filename || "สลิปเงินเดือน") + ".pdf" })
        .from(el);
      await worker.toPdf();
      const pdf = worker.prop.pdf;
      for (let i = pdf.internal.getNumberOfPages(); i > 1; i--) pdf.deletePage(i);
      await worker.save();
    } catch (err) {
      UI.toast("สร้าง PDF ไม่สำเร็จ: " + err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "⬇ ดาวน์โหลด PDF";
    }
  },

  async downloadMultiPdf(pages, btn) {
    btn.disabled = true;
    try {
      // ใบแรก: สร้างผ่าน html2pdf ตามปกติแล้วตัดหน้าว่างส่วนเกินออก เพื่อเอา jsPDF instance มาต่อใบถัดไป
      btn.textContent = `กำลังสร้าง PDF... (1/${pages.length})`;
      const worker = html2pdf().set(Slip.PDF_OPTS).from(pages[0]);
      await worker.toPdf();
      const pdf = worker.prop.pdf;
      for (let i = pdf.internal.getNumberOfPages(); i > 1; i--) pdf.deletePage(i);

      // ใบถัดไป: แปลงเป็นภาพแล้ววาดลงหน้าใหม่เอง (หน้าละ 1 ใบเสมอ ไม่ต้องเดาการตัดหน้าแบบ auto)
      for (let i = 1; i < pages.length; i++) {
        btn.textContent = `กำลังสร้าง PDF... (${i + 1}/${pages.length})`;
        const canvasWorker = html2pdf().set(Slip.PDF_OPTS).from(pages[i]);
        await canvasWorker.toCanvas();
        const imgData = canvasWorker.prop.canvas.toDataURL("image/jpeg", 0.98);
        pdf.addPage("a4", "portrait");
        pdf.addImage(imgData, "JPEG", 0, 0, 210, 297);
      }

      const stamp = new Date().toISOString().slice(0, 10);
      pdf.save(`สลิปเงินเดือนรวม_${pages.length}ใบ_${stamp}.pdf`);
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

  // data: { fullName, employeeType, departmentName, docTitle, subtitle, metaLabel, metaValue,
  //          income, deductions, total_income, total_deduction, net_pay, filenameBase, note }
  // ใช้ shape กลางนี้ร่วมกันทั้งสลิปที่มาจากข้อมูลนำเข้า Excel และสลิปที่จัดทำเอง (Manual)
  renderHTML(data, org) {
    const incomeRows = Object.entries(data.income || {}).filter(([, v]) => Number(v) > 0);
    const deductionRows = Object.entries(data.deductions || {}).filter(([, v]) => Number(v) > 0);

    const logoHtml = org && org.logo_url ? `<img src="${org.logo_url}" alt="โลโก้"/>` : `<div class="seal-fallback">${(org && org.org_name_short) || "ทม."}</div>`;
    const watermarkHtml = org && org.logo_url ? `<div class="slip-watermark"><img src="${org.logo_url}" alt=""/></div>` : "";

    const incomeHtml = incomeRows.length ? incomeRows.map(([label, v]) => `<tr><td>${label}</td><td>${Slip.fmt(v)}</td></tr>`).join("") : `<tr class="empty-row"><td colspan="2">- ไม่มีรายการ -</td></tr>`;
    const deductionHtml = deductionRows.length ? deductionRows.map(([label, v]) => `<tr><td>${label}</td><td>${Slip.fmt(v)}</td></tr>`).join("") : `<tr class="empty-row"><td colspan="2">- ไม่มีรายการ -</td></tr>`;

    const noteHtml = data.note ? `<div class="slip-section-label" style="margin-top:10px;">หมายเหตุ</div><div style="font-size:12.5px;">${data.note}</div>` : "";

    return `
      <div class="slip-page" data-filename="${data.filenameBase || "สลิป"}">
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
            <h2>${data.docTitle || "สลิปเงินเดือน"}</h2>
            <div class="period">${data.subtitle || ""}</div>
          </div>
          <div class="slip-recipient">
            <div><span class="label">ชื่อ-สกุล:</span> ${data.fullName || "-"}</div>
            <div><span class="label">ประเภท:</span> ${data.employeeType || "-"}</div>
            <div><span class="label">กอง/สำนัก:</span> ${data.departmentName || "-"}</div>
            <div><span class="label">${data.metaLabel || "งวด:"}</span> ${data.metaValue || "-"}</div>
          </div>
          <div class="slip-cols">
            <div>
              <div class="slip-section-label">รายการรับ</div>
              <table class="slip-table"><tbody>
                ${incomeHtml}
                <tr class="slip-totalrow"><td>รวมรายการรับ</td><td>${Slip.fmt(data.total_income)}</td></tr>
              </tbody></table>
            </div>
            <div>
              <div class="slip-section-label">รายการหัก</div>
              <table class="slip-table"><tbody>
                ${deductionHtml}
                <tr class="slip-totalrow"><td>รวมรายการหัก</td><td>${Slip.fmt(data.total_deduction)}</td></tr>
              </tbody></table>
            </div>
          </div>
          <div class="slip-net">
            <div class="lbl">เงินรับสุทธิ</div>
            <div class="amt">${Slip.fmt(data.net_pay)} บาท</div>
          </div>
          ${noteHtml}
          <div class="slip-genat">ออกสลิปเมื่อ ${new Date().toLocaleString("th-TH")}</div>
        </div>
      </div>
    `;
  },
};
