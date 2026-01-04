import { dbConnection } from "./database/dbconnection.js";
import petModel from "./database/models/pet.model.js";

const checkVaccinations = async () => {
  await dbConnection();

  console.log("Checking for vaccinations...");
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  console.log("Query Range Start:", start);
  console.log("Query Range End:", end);

  // ==> find ALL pets with any vaccination history to inspect dates
  const pets = await petModel.find({
    isDeleted: false,
    "vaccinationHistory.0": { $exists: true },
  }).select("name vaccinationHistory");

  console.log(`Found ${pets.length} pets with vaccination history.`);

  let matchCount = 0;
  pets.forEach((pet) => {
    pet.vaccinationHistory.forEach((v) => {
      if (v.nextDose) {
        const d = new Date(v.nextDose);
        const isToday = d >= start && d <= end;
        if (isToday) {
          matchCount++;
          console.log(
            `MATCH FOUND: Pet: ${pet.name}, Dose Date: ${d}, Status: ${v.status}`
          );
        } else {
          console.log(
            `NO MATCH: Pet: ${pet.name}, Dose Date: ${d}, Status: ${v.status}`
          );
        }
      }
    });
  });

  console.log(`Total matches found in JS filtering: ${matchCount}`);
  process.exit();
};

checkVaccinations();
