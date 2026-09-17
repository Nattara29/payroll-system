// โปรไฟล์ของฉัน: แก้ไขชื่อ-สกุลตนเอง และเปลี่ยนรหัสผ่าน — ใช้ได้ทั้งผู้ดูแลระบบและเจ้าหน้าที่
const Profile = {
  load() {
    document.getElementById("profFullName").value = AppState.profile.full_name || "";
    document.getElementById("profEmail").value = AppState.profile.email || AppState.user.email || "";
    document.getElementById("profRole").value = AppState.profile.role === "admin" ? "ผู้ดูแลระบบ" : "เจ้าหน้าที่";
    document.getElementById("profNewPassword").value = "";
    document.getElementById("profConfirmPassword").value = "";
  },

  async saveName() {
    const name = document.getElementById("profFullName").value.trim();
    if (!name) return UI.toast("กรุณากรอกชื่อ-สกุล", true);
    const btn = document.getElementById("profSaveBtn");
    btn.disabled = true;
    const { error } = await sb.from("profiles").update({ full_name: name }).eq("id", AppState.user.id);
    btn.disabled = false;
    if (error) return UI.toast("บันทึกไม่สำเร็จ: " + error.message, true);
    AppState.profile.full_name = name;
    document.getElementById("whoAmI").textContent = `${AppState.profile.full_name} (${AppState.profile.role === "admin" ? "ผู้ดูแลระบบ" : "เจ้าหน้าที่"})`;
    UI.toast("บันทึกข้อมูลส่วนตัวเรียบร้อยแล้ว");
  },

  async changePassword() {
    const pw = document.getElementById("profNewPassword").value;
    const confirmPw = document.getElementById("profConfirmPassword").value;
    if (pw.length < 6) return UI.toast("รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร", true);
    if (pw !== confirmPw) return UI.toast("รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน", true);
    const btn = document.getElementById("profPasswordBtn");
    btn.disabled = true;
    const { error } = await sb.auth.updateUser({ password: pw });
    btn.disabled = false;
    if (error) return UI.toast("เปลี่ยนรหัสผ่านไม่สำเร็จ: " + error.message, true);
    document.getElementById("profNewPassword").value = "";
    document.getElementById("profConfirmPassword").value = "";
    UI.toast("เปลี่ยนรหัสผ่านเรียบร้อยแล้ว");
  },
};
