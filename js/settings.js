// ตั้งค่าหน่วยงาน: ข้อมูลหน่วยงาน + โลโก้ (เก็บใน Supabase Storage บักเก็ต org-assets)
const LOGO_BUCKET = "org-assets";

// ปรับสิ่งที่แสดงบน sidebar/topbar ให้ตรงกับข้อมูลตั้งค่าล่าสุด เรียกทั้งตอน boot และหลังบันทึกตั้งค่า
function applyOrgBranding(settings) {
  if (!settings) return;
  const orgNameEl = document.getElementById("brandOrgName");
  const orgPillEl = document.getElementById("orgPill");
  if (orgNameEl) orgNameEl.textContent = settings.org_name || "เทศบาลเมืองศรีสัชนาลัย";
  if (orgPillEl) orgPillEl.textContent = settings.org_name || "เทศบาลเมืองศรีสัชนาลัย";

  const sealEl = document.getElementById("brandSeal");
  if (sealEl) {
    if (settings.logo_url) {
      sealEl.innerHTML = `<img src="${settings.logo_url}" alt="โลโก้" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>`;
    } else {
      sealEl.textContent = settings.org_name_short || "ทม.";
    }
  }
}

const Settings = {
  current: null,

  async load() {
    const isAdmin = AppState.profile && AppState.profile.role === "admin";
    document.getElementById("settingsReadonlyNote").style.display = isAdmin ? "none" : "block";
    document.getElementById("setSaveBtn").style.display = isAdmin ? "" : "none";
    document.getElementById("logoUploadField").style.display = isAdmin ? "" : "none";

    const { data, error } = await sb.from("org_settings").select("*").eq("id", 1).single();
    if (error) return UI.toast("โหลดข้อมูลตั้งค่าไม่สำเร็จ: " + error.message, true);
    Settings.current = data;

    document.getElementById("setOrgName").value = data.org_name || "";
    document.getElementById("setOrgShort").value = data.org_name_short || "";
    document.getElementById("setAddress").value = data.address || "";
    document.getElementById("setPhone").value = data.phone || "";
    document.getElementById("setEmail").value = data.email || "";
    document.getElementById("setDirectorName").value = data.director_name || "";
    document.getElementById("setDirectorTitle").value = data.director_title || "";

    ["setOrgName", "setOrgShort", "setAddress", "setPhone", "setEmail", "setDirectorName", "setDirectorTitle"].forEach((id) => {
      document.getElementById(id).disabled = !isAdmin;
    });

    Settings.renderLogoPreview(data.logo_url);

    const fileInput = document.getElementById("setLogoFile");
    fileInput.value = "";
    fileInput.onchange = Settings.onLogoChosen;
  },

  renderLogoPreview(logoUrl) {
    const preview = document.getElementById("logoPreview");
    const status = document.getElementById("logoStatus");
    if (logoUrl) {
      preview.innerHTML = `<img src="${logoUrl}" alt="โลโก้หน่วยงาน" style="width:100%;height:100%;object-fit:cover;"/>`;
      status.textContent = "ใช้งานโลโก้นี้อยู่";
    } else {
      preview.innerHTML = `<span style="font-size:11px;color:var(--text-soft);">ไม่มีโลโก้</span>`;
      status.textContent = "ยังไม่มีโลโก้ ระบบจะแสดงชื่อย่อแทน";
    }
  },

  async save() {
    const btn = document.getElementById("setSaveBtn");
    btn.disabled = true;
    const payload = {
      org_name: document.getElementById("setOrgName").value.trim(),
      org_name_short: document.getElementById("setOrgShort").value.trim() || "ทม.",
      address: document.getElementById("setAddress").value.trim(),
      phone: document.getElementById("setPhone").value.trim(),
      email: document.getElementById("setEmail").value.trim(),
      director_name: document.getElementById("setDirectorName").value.trim(),
      director_title: document.getElementById("setDirectorTitle").value.trim(),
      updated_at: new Date().toISOString(),
      updated_by: AppState.user.id,
    };
    const { data, error } = await sb.from("org_settings").update(payload).eq("id", 1).select("*").single();
    btn.disabled = false;
    if (error) return UI.toast("บันทึกไม่สำเร็จ: " + error.message, true);
    Settings.current = data;
    applyOrgBranding(data);
    UI.toast("บันทึกข้อมูลหน่วยงานเรียบร้อยแล้ว");
  },

  async onLogoChosen(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return UI.toast("ไฟล์ใหญ่เกิน 2 MB กรุณาเลือกไฟล์ที่เล็กกว่านี้", true);
    const status = document.getElementById("logoStatus");
    status.textContent = "กำลังอัปโหลด...";
    try {
      const ext = file.name.split(".").pop().toLowerCase();
      const path = `logo.${ext}`;
      const { error: upErr } = await sb.storage.from(LOGO_BUCKET).upload(path, file, { upsert: true, cacheControl: "60" });
      if (upErr) throw upErr;
      const { data: urlData } = sb.storage.from(LOGO_BUCKET).getPublicUrl(path);
      const logoUrl = urlData.publicUrl + "?t=" + Date.now(); // กันแคชรูปเก่าไว้
      const { data, error } = await sb.from("org_settings").update({ logo_url: logoUrl, updated_at: new Date().toISOString(), updated_by: AppState.user.id }).eq("id", 1).select("*").single();
      if (error) throw error;
      Settings.current = data;
      Settings.renderLogoPreview(logoUrl);
      applyOrgBranding(data);
      UI.toast("อัปโหลดโลโก้เรียบร้อยแล้ว");
    } catch (err) {
      status.textContent = "อัปโหลดไม่สำเร็จ: " + err.message;
    }
  },
};
