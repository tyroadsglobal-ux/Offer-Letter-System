const email = document.getElementById("email");
const password = document.getElementById("password");
const msg = document.getElementById("msg");

async function login() {
  const res = await fetch("/hr-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      email: email.value,
      password: password.value,
    }),
  });

  const data = await res.json();
  res.ok ? location.href = "/dashboard.html" : msg.innerText = data.message;
}
