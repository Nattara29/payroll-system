// จัดการผู้ใช้งาน: กำหนดบัญชีผู้ใช้และบทบาทการเข้าถึงระบบ (admin เท่านั้น)
const Users = {
  rows: [],

  async load() {
    const tbody = document.querySelector("#usersTable tbody");
    if (!AppState.profile || AppState.profile.role !== "admin") {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-soft);">หน้านี้สำหรับผู้ดูแลระบบเท่านั้น</td></tr>';
      return;
    }
    const { data, error } = await sb.from("profiles").select("id,full_name,email,role,active,created_at").order("created_at");
    if (error) {
      tbody.innerHTML = `<tr><td colspan="6">โหลดข้อมูลไม่สำเร็จ: ${error.message}</td></tr>`;
      return;
    }
    Users.rows = data || [];
    if (Users.rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-soft);">ยังไม่มีผู้ใช้งาน</td></tr>';
      return;
    }
    tbody.innerHTML = Users.rows
      .map((u) => {
        const isSelf = u.id === AppState.user.id;
        const roleSelect = `<select ${isSelf ? "disabled" : ""} onchange="Users.changeRole('${u.id}', this.value)">
          <option value="staff" ${u.role === "staff" ? "selected" : ""}>เจ้าหน้าที่ (staff)</option>
          <option value="admin" ${u.role === "admin" ? "selected" : ""}>ผู้ดูแลระบบ (admin)</option>
        </select>`;
        const statusBadge = `<span class="badge ${u.active ? "badge-green" : "badge-red"}">${u.active ? "เปิดใช้งาน" : "ปิดใช้งาน"}</span>`;
        const actions = isSelf
          ? '<span class="helptext" style="margin:0;">(บัญชีของคุณ)</span>'
          : `<div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button class="btn ${u.active ? "btn-danger" : "btn-primary"} btn-sm" onclick="Users.toggleActive('${u.id}', ${u.active})">${u.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}</button>
              <button class="btn btn-danger btn-sm" onclick="Users.deleteUser('${u.id}')">ลบ</button>
            </div>`;
        return `<tr>
        <td>${u.full_name}</td>
        <td>${u.email || "-"}</td>
        <td>${roleSelect}</td>
        <td>${statusBadge}</td>
        <td>${new Date(u.created_at).toLocaleDateString("th-TH")}</td>
        <td>${actions}</td>
      </tr>`;
      })
      .join("");
  },

  async changeRole(userId, newRole) {
    if (userId === AppState.user.id) return UI.toast("ไม่สามารถเปลี่ยนบทบาทของบัญชีตัวเองได้", true);
    const { error } = await sb.from("profiles").update({ role: newRole }).eq("id", userId);
    if (error) {
      UI.toast("เปลี่ยนบทบาทไม่สำเร็จ: " + error.message, true);
      return Users.load();
    }
    UI.toast("เปลี่ยนบทบาทเรียบร้อยแล้ว");
    Users.load();
  },

  async toggleActive(userId, currentActive) {
    if (userId === AppState.user.id) return UI.toast("ไม่สามารถปิดใช้งานบัญชีตัวเองได้", true);
    const nextActive = !currentActive;
    const label = nextActive ? "เปิดใช้งาน" : "ปิดใช้งาน";
    const ok = await UI.confirmDialog({
      title: `${label}บัญชีนี้?`,
      html: nextActive ? "" : '<p style="text-align:left;color:var(--text-soft);">ผู้ใช้จะเข้าสู่ระบบและใช้งานข้อมูลใด ๆ ไม่ได้อีกทันที</p>',
      confirmText: label,
      danger: !nextActive,
    });
    if (!ok) return;
    const { error } = await sb.from("profiles").update({ active: nextActive }).eq("id", userId);
    if (error) return UI.toast(`${label}ไม่สำเร็จ: ` + error.message, true);
    UI.toast(`${label}บัญชีเรียบร้อยแล้ว`);
    Users.load();
  },

  // ลบบัญชีผู้ใช้ถาวร ใช้สำหรับกรณีบุคคลนั้นไม่ได้ทำงานที่นี่แล้ว (ต่างจาก "ปิดใช้งาน" ที่ยังเก็บบัญชีไว้ชั่วคราว)
  async deleteUser(userId) {
    if (userId === AppState.user.id) return UI.toast("ไม่สามารถลบบัญชีตัวเองได้", true);
    const row = Users.rows.find((u) => u.id === userId);
    const label = row ? `${row.full_name}${row.email ? ` (${row.email})` : ""}` : "บัญชีนี้";
    const ok = await UI.confirmDialog({
      title: "ลบบัญชีผู้ใช้นี้?",
      html: `<div style="text-align:left;font-size:14px;">
        <p><b>${escapeHtml(label)}</b></p>
        <p style="color:var(--text-soft);">ใช้สำหรับกรณีบุคคลนี้ไม่ได้ทำงานที่นี่แล้ว บัญชีจะหายไปจากรายชื่อและเข้าใช้งานระบบไม่ได้อีกทันที</p>
        <p style="color:var(--text-soft);">ข้อมูลที่เคยทำไว้ (เช่น ประวัติการนำเข้า/สลิปที่เคยสร้าง) จะยังอยู่ครบ เพียงแต่จะไม่ระบุชื่อผู้ทำรายการอีกต่อไป การกระทำนี้ย้อนกลับไม่ได้</p>
      </div>`,
      confirmText: "ลบถาวร",
    });
    if (!ok) return;
    const { error } = await sb.from("profiles").delete().eq("id", userId);
    if (error) return UI.toast("ลบไม่สำเร็จ: " + error.message, true);
    UI.toast("ลบบัญชีผู้ใช้เรียบร้อยแล้ว");
    Users.load();
  },
};
