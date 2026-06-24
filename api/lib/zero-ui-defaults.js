const { resolveLtCityNominative } = require("./lithuanian-location-normalize");

const DEFAULT_USER_REGION = "Panevėžys";

const DEFAULT_PRIMARY_VEHICLE = {
  make: "Volvo",
  model: "V70",
  year: 2006,
};

function resolveAgentDefaultCity(input) {
  const trimmed = String(input ?? "").trim();
  if (
    !trimmed ||
    trimmed.toLowerCase() === "lietuva" ||
    trimmed.toLowerCase() === "miestas"
  ) {
    return DEFAULT_USER_REGION;
  }
  return resolveLtCityNominative(trimmed);
}

function formatPrimaryVehicleLabel(vehicle) {
  return `${vehicle.year} m. ${vehicle.make} ${vehicle.model}`;
}

module.exports = {
  DEFAULT_USER_REGION,
  DEFAULT_PRIMARY_VEHICLE,
  resolveAgentDefaultCity,
  formatPrimaryVehicleLabel,
};
