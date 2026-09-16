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
        const toggleBtn = isSelf
          ? '<span class="helptext" style="margin:0;">(บัญชีของคุณ)</span>'
          : `<button class="btn ${u.active ? "btn-danger" : "btn-primary"} btn-sm" onclick="Users.toggleActive('${u.id}', ${u.active})">${u.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}</button>`;
        return `<tr>
        <td>${u.full_name}</td>
        <td>${u.email || "-"}</td>
        <td>${roleSelect}</td>
        <td>${statusBadge}</td>
        <td>${new Date(u.created_at).toLocaleDateString("th-TH")}</td>
        <td>${toggleBtn}</td>
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
    if (!confirm(`${label}บัญชีนี้?` + (nextActive ? "" : "\n\nผู้ใช้จะเข้าสู่ระบบและใช้งานข้อมูลใด ๆ ไม่ได้อีกทันที"))) return;
    const { error } = await sb.from("profiles").update({ active: nextActive }).eq("id", userId);
    if (error) return UI.toast(`${label}ไม่สำเร็จ: ` + error.message, true);
    UI.toast(`${label}บัญชีเรียบร้อยแล้ว`);
    Users.load();
  },
};
