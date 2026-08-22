const form = document.querySelector("#route-form");
const arrivalInput = document.querySelector("#arrive-at");
const submitButton = document.querySelector("#submit-button");
const placeholder = document.querySelector("#placeholder");
const resultCard = document.querySelector("#result-card");
const errorCard = document.querySelector("#error-card");

function toLocalInputValue(date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

const tomorrowMorning = new Date();
tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
tomorrowMorning.setHours(8, 30, 0, 0);
arrivalInput.value = toLocalInputValue(tomorrowMorning);
arrivalInput.min = toLocalInputValue(new Date());

function formatTime(value) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date(value));
}

function showError(message) {
  placeholder.hidden = true;
  resultCard.hidden = true;
  errorCard.hidden = false;
  document.querySelector("#error-message").textContent = message;
}

function showResult(result) {
  placeholder.hidden = true;
  errorCard.hidden = true;
  resultCard.hidden = false;
  document.querySelector("#leave-time").textContent = formatTime(result.departureTime);
  document.querySelector("#leave-date").textContent = formatDate(result.departureTime);
  document.querySelector("#start-label").textContent = result.startLabel;
  document.querySelector("#end-label").textContent = result.endLabel;
  document.querySelector("#drive-time").textContent = `${Math.round(result.travelTimeInSeconds / 60)} min`;
  document.querySelector("#distance").textContent = `${(result.distanceMeters / 1609.344).toFixed(1)} mi`;
  document.querySelector("#traffic-delay").textContent = `${Math.round(result.trafficDelayInSeconds / 60)} min`;
  document.querySelector("#arrival-time").textContent = formatTime(result.arrivalTime);
  resultCard.scrollIntoView({ behavior: "smooth", block: "center" });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorCard.hidden = true;
  resultCard.hidden = true;
  submitButton.disabled = true;
  submitButton.textContent = "Checking traffic…";

  try {
    const response = await fetch("/api/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start: document.querySelector("#start").value.trim(),
        end: document.querySelector("#end").value.trim(),
        arriveAt: new Date(arrivalInput.value).toISOString(),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "We couldn’t calculate that route.");
    showResult(data);
  } catch (error) {
    showError(error instanceof Error ? error.message : "We couldn’t calculate that route.");
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Calculate leave time <span aria-hidden="true">→</span>';
  }
});
