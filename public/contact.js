// Contact + effect-request forms post to the Worker, which relays to Brevo.
// Shared by index.html (effect-request form + support modal) and faq.html
// (support modal only). Every lookup is guarded, so each page only wires the
// elements it actually has. Loaded with `defer`, so the DOM is ready here.
(function () {
  var sentDialog = document.getElementById("sentDialog");
  var sentClose = document.getElementById("sentClose");
  if (sentClose && sentDialog) {
    sentClose.addEventListener("click", function () { sentDialog.close(); });
  }

  function showSent() {
    if (sentDialog && typeof sentDialog.showModal === "function") {
      sentDialog.showModal();
    } else {
      alert("Message sent — thanks! I'll reply to the email you gave.");
    }
  }

  async function send(payload) {
    var res = await fetch("/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    var data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok || !data.ok) {
      throw new Error((data && data.error) || "Couldn't send your message. Please try again.");
    }
  }

  function wire(form, buildPayload, onSuccess) {
    if (!form) return;
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      var original = btn ? btn.textContent : "";
      if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
      try {
        await send(buildPayload(form));
        form.reset();
        if (onSuccess) onSuccess();
        showSent();
      } catch (err) {
        alert(err.message || "Couldn't send your message. Please try again.");
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = original; }
      }
    });
  }

  // Effect-request form (field is "description" → API expects "message").
  wire(document.getElementById("contactForm"), function (form) {
    return {
      type: "effect-request",
      email: (form.email.value || "").trim(),
      effect: (form.effect.value || "").trim(),
      message: (form.description.value || "").trim(),
      company: (form.company.value || "").trim(),
    };
  });

  // Footer "Contact support" → modal form.
  var supportDialog = document.getElementById("supportDialog");
  var supportTrigger = document.getElementById("supportTrigger");
  var supportClose = document.getElementById("supportClose");
  if (supportTrigger && supportDialog) {
    supportTrigger.addEventListener("click", function () {
      if (typeof supportDialog.showModal === "function") supportDialog.showModal();
    });
  }
  if (supportClose && supportDialog) {
    supportClose.addEventListener("click", function () { supportDialog.close(); });
  }
  if (supportDialog) {
    // Click outside the form (on the backdrop) closes it.
    supportDialog.addEventListener("click", function (e) {
      if (e.target === supportDialog) supportDialog.close();
    });
  }
  wire(
    document.getElementById("supportForm"),
    function (form) {
      return {
        type: "support",
        email: (form.email.value || "").trim(),
        message: (form.message.value || "").trim(),
        company: (form.company.value || "").trim(),
      };
    },
    function () { if (supportDialog) supportDialog.close(); }
  );
})();
