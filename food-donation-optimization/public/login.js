const roleButtons = document.querySelectorAll("[data-role]");
const modeButtons = document.querySelectorAll("[data-mode]");
const title = document.getElementById("login-title");
const orgField = document.getElementById("organization-field");
const orgInput = document.getElementById("organization");
const submitButton = document.getElementById("submit-account");
const form = document.getElementById("account-form");
const message = document.getElementById("account-message");
let role = "donor";
let mode = "login";

function renderForm() {
  const roleLabel = role === "donor" ? "food donor" : "food recipient";
  title.textContent = mode === "login" ? "Welcome back" : `Join as a ${roleLabel}`;
  submitButton.innerHTML = `${mode === "login" ? "Log in" : "Create account"} <span>→</span>`;
  orgField.classList.toggle("hidden", mode !== "register");
  orgInput.required = mode === "register";
  document.getElementById("password").autocomplete = mode === "login" ? "current-password" : "new-password";
  message.textContent = "";
}

roleButtons.forEach(button => button.addEventListener("click", () => {
  role = button.dataset.role;
  roleButtons.forEach(item => item.classList.toggle("selected", item === button));
  renderForm();
}));

modeButtons.forEach(button => button.addEventListener("click", () => {
  mode = button.dataset.mode;
  modeButtons.forEach(item => {
    const selected = item === button;
    item.classList.toggle("selected", selected);
    item.setAttribute("aria-selected", String(selected));
  });
  renderForm();
}));

form.addEventListener("submit", async event => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(form).entries());
  body.role = role;
  const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
  submitButton.disabled = true;
  message.textContent = mode === "register" ? "Creating your account…" : "Signing you in…";
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Could not connect to the account service.");
    message.textContent = mode === "register" ? "Account created. Taking you to FoodBridge…" : "You’re logged in. Taking you to FoodBridge…";
    window.setTimeout(() => { window.location.href = "/"; }, 700);
  } catch (error) {
    message.textContent = error.message === "Failed to fetch"
      ? "Can’t reach the FoodBridge server. Start it with npm start, then open http://localhost:3000/login.html."
      : error.message;
  } finally {
    submitButton.disabled = false;
  }
});
