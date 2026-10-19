// Milestone 1.1: starter screen. Rooms arrive in Milestone 1.2 (Firebase).
const toast = document.getElementById('toast');
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

document.getElementById('create-btn').addEventListener('click', () => {
  showToast('Rooms are coming in the next update! 🛠️');
});

const codeInput = document.getElementById('room-code');
codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, '');
});

document.getElementById('join-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (codeInput.value.length !== 4) {
    showToast('Room codes have 4 letters');
    return;
  }
  showToast('Joining is coming in the next update! 🛠️');
});
