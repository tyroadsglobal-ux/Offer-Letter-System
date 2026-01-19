document.addEventListener("DOMContentLoaded", () => {
  const tbody = document.getElementById("data");
  const refreshBtn = document.getElementById("refreshBtn");

  async function load() {
    const res = await fetch("/hr-dashboard", { credentials: "include" });
    if (res.status === 401) return location.href = "/login.html";

    const data = await res.json();
    tbody.innerHTML = "";

    data.forEach(o => {
      let statusBadge = "";

      if (o.status === "ACCEPTED") {
        statusBadge = `<span class="px-2 py-1 text-green-700 bg-green-100 rounded text-sm font-semibold">ACCEPTED</span>`;
      } else if (o.status === "REJECTED") {
        statusBadge = `<span class="px-2 py-1 text-red-700 bg-red-100 rounded text-sm font-semibold">REJECTED</span>`;
      } else {
        statusBadge = `<span class="px-2 py-1 text-yellow-700 bg-yellow-100 rounded text-sm font-semibold">PENDING</span>`;
      }

      tbody.innerHTML += `
        <tr class="border-b hover:bg-gray-50">
          <td class="p-2 text-center"><input type="checkbox"></td>
          <td class="p-2">${o.candidate_name}</td>
          <td class="p-2">${o.email}</td>
          <td class="p-2">${o.position}</td>
          <td class="p-2">₹${o.salary}</td>
          <td class="p-2">${statusBadge}</td>
        </tr>`;
    });
  }

  refreshBtn.onclick = load;
  load();
  setInterval(load, 5000);
});
