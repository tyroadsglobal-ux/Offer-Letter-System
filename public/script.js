const name = document.getElementById("name");
const email = document.getElementById("candidateEmail"); // ✅ FIX
const position = document.getElementById("position");
const salary = document.getElementById("salary");
const file = document.getElementById("file");
const msg = document.getElementById("msg");

async function createOffer() {
  msg.innerText = "Processing...";

  const formData = new FormData();

  if (file.files.length > 0) {
    formData.append("file", file.files[0]);
  } else {
    formData.append("name", name.value);
    formData.append("email", email.value);
    formData.append("position", position.value);
    formData.append("salary", salary.value);
  }

  const res = await fetch("/create-offer", {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  const data = await res.json();
  msg.innerText = data.message;

  if (res.ok) {
    name.value = "";
    email.value = "";
    position.value = "";
    salary.value = "";
    file.value = "";
  }
}
