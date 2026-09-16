// อ่านและตีความไฟล์ Excel เงินเดือน (รูปแบบ งด.2: หนึ่งชีท = หนึ่งกอง/สำนัก)
// หน้าที่ของไฟล์นี้คือ "แปลงตารางที่มนุษย์อ่านง่าย" ให้เป็นข้อมูลที่โปรแกรมเข้าใจ
// แล้วส่งให้ผู้ใช้ยืนยัน/ปรับ mapping อีกครั้งก่อนบันทึกจริง
const PayrollImport = (() => {
  // ชื่อชีทใน Excel ถูกจำกัดไว้ไม่เกิน 31 ตัวอักษร ทำให้ชื่อกอง/สำนักยาว ๆ ถูกตัดทอน
  // แผนที่นี้แปลงชื่อชีทที่ถูกตัดทอน กลับเป็นชื่อเต็มของหน่วยงานจริงในเทศบาลเมืองศรีสัชนาลัย
  const DEPARTMENT_NAME_MAP = {
    "งานบริหารทั่วไป": "งานบริหารทั่วไป",
    "งานบริหารงานคลัง": "งานบริหารงานคลัง",
    "งานควบคุมภายในและการตรวจสอบภายใ": "งานควบคุมภายในและการตรวจสอบภายใน",
    "งานบริหารทั่วไปเกี่ยวกับการรักษ": "งานบริหารทั่วไปเกี่ยวกับการรักษาความสงบภายใน",
    "งานบริหารทั่วไปเกี่ยวกับการศึกษ": "งานบริหารทั่วไปเกี่ยวกับการศึกษา",
    "งานบริหารทั่วไปเกี่ยวกับสาธารณส": "งานบริหารทั่วไปเกี่ยวกับสาธารณสุข",
    "งานบริหารทั่วไปเกี่ยวกับเคหะและ": "งานบริหารทั่วไปเกี่ยวกับเคหะและชุมชน",
    "งานบริหารทั่วไปเกี่ยวกับสร้างคว": "งานบริหารทั่วไปเกี่ยวกับสร้างความเข้มแข็งชุมชน",
  };

  function resolveDepartmentName(sheetName) {
    return DEPARTMENT_NAME_MAP[sheetName] || sheetName;
  }

  function cell(sheet, row, col) {
    const addr = XLSX.utils.encode_cell({ r: row - 1, c: col - 1 });
    const c = sheet[addr];
    if (!c) return null;
    const v = c.v;
    if (v === undefined || v === null) return null;
    if (typeof v === "string" && v.trim() === "") return null;
    if (typeof v === "string" && v.trim() === "-") return null;
    return typeof v === "string" ? v.trim() : v;
  }

  function sheetRange(sheet) {
    const ref = sheet["!ref"];
    if (!ref) return { maxRow: 0, maxCol: 0 };
    const range = XLSX.utils.decode_range(ref);
    return { maxRow: range.e.r + 1, maxCol: range.e.c + 1 };
  }

  // หาแถวหัวตาราง: แถวที่มีคำว่า "ชื่อ" และ "ประเภทพนักงาน" อยู่ด้วยกัน
  function detectHeaderRow(sheet, maxRow, maxCol) {
    const scanRows = Math.min(maxRow, 15);
    for (let r = 1; r <= scanRows; r++) {
      let hasName = false, hasType = false;
      for (let c = 1; c <= maxCol; c++) {
        const v = cell(sheet, r, c);
        if (typeof v === "string") {
          if (v.includes("ชื่อ")) hasName = true;
          if (v.includes("ประเภทพนักงาน")) hasType = true;
        }
      }
      if (hasName && hasType) return r;
    }
    return null;
  }

  function forwardFill(arr) {
    const out = arr.slice();
    let last = null;
    for (let i = 0; i < out.length; i++) {
      if (out[i] !== null && out[i] !== undefined) last = out[i];
      else out[i] = last;
    }
    return out;
  }

  // สำคัญ: คอลัมน์ "รวมรายการรับ"/"รวมรายการหัก" เป็นผลรวมที่ไฟล์คำนวณมาให้แล้ว
  // ต้องแยกออกจากรายการย่อย ไม่เช่นนั้นจะถูกบวกซ้ำตอนคำนวณยอดรวมเอง (นับสองเท่า)
  // จึงจัดเป็น kind พิเศษไว้ใช้ "ตรวจทาน" ยอดรวมเท่านั้น ไม่ใช่รายการที่ map ได้
  function classifyGroup(label, groupLabel) {
    const g = groupLabel || "";
    if (g.includes("ชื่อ")) return "identity_name";
    if (g.includes("ประเภทพนักงาน")) return "identity_type";
    if (g.includes("หน่วยงาน")) return "identity_dept";
    if (g.includes("รับสุทธิ")) return "net_pay";
    const isSubtotal = String(label || "").trim().startsWith("รวม");
    if (isSubtotal) {
      if (g.includes("หัก")) return "deduction_subtotal";
      if (g.includes("รับ")) return "income_subtotal";
      return "other";
    }
    if (g.includes("รายการหัก") || g.includes("หัก")) return "deduction";
    if (g.includes("รายการรับ") || g.includes("รับ")) return "income";
    return "other";
  }

  // วิเคราะห์ 1 ชีท -> คืนโครงสร้างคอลัมน์ที่ตรวจพบ + แถวข้อมูลดิบ
  function analyzeSheet(sheet, sheetName) {
    const { maxRow, maxCol } = sheetRange(sheet);
    const groupRow = detectHeaderRow(sheet, maxRow, maxCol);
    if (!groupRow) {
      return { sheetName, ok: false, reason: "ไม่พบแถวหัวตาราง (ต้องมีคำว่า \"ชื่อ\" และ \"ประเภทพนักงาน\")" };
    }
    const subRow = groupRow + 1;
    const dataStartRow = subRow + 1;

    const rawGroup = [];
    const rawSub = [];
    for (let c = 1; c <= maxCol; c++) {
      rawGroup.push(cell(sheet, groupRow, c));
      rawSub.push(cell(sheet, subRow, c));
    }
    const filledGroup = forwardFill(rawGroup);

    const columns = [];
    for (let i = 0; i < maxCol; i++) {
      const c = i + 1;
      if (rawSub[i] === null && rawGroup[i] === null) continue; // คอลัมน์เว้นว่าง/merged spacer
      const label = rawSub[i] !== null ? rawSub[i] : rawGroup[i];
      const groupLabel = filledGroup[i];
      columns.push({
        colIndex: c,
        label: String(label),
        groupLabel: groupLabel ? String(groupLabel) : "",
        kind: classifyGroup(String(label), groupLabel),
      });
    }

    const nameCol = columns.find((x) => x.kind === "identity_name");
    const rows = [];
    for (let r = dataStartRow; r <= maxRow; r++) {
      const nameVal = nameCol ? cell(sheet, r, nameCol.colIndex) : null;
      if (!nameVal || typeof nameVal !== "string") continue;
      if (nameVal.includes("ชื่อ") || nameVal.includes("รวม") || nameVal.includes("เฉลี่ย")) continue;
      const record = {};
      for (const col of columns) {
        record[col.label] = cell(sheet, r, col.colIndex);
      }
      rows.push(record);
    }

    return { sheetName, departmentName: resolveDepartmentName(sheetName), ok: true, groupRow, subRow, dataStartRow, columns, rows };
  }

  function analyzeWorkbook(workbook) {
    return workbook.SheetNames.map((name) => analyzeSheet(workbook.Sheets[name], name));
  }

  function toNumber(v) {
    if (v === null || v === undefined) return 0;
    if (typeof v === "number") return v;
    const n = parseFloat(String(v).replace(/,/g, ""));
    return isNaN(n) ? 0 : n;
  }

  return { analyzeWorkbook, analyzeSheet, toNumber };
})();
