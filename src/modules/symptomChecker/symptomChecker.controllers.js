import SymptomChecker from "../../../database/models/symptomChecker.model.js";
import Pet from "../../../database/models/pet.model.js";
import { AppError, catchAsyncError } from "../../utils/catch-error.js";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// ===> 1- Helper function to analyze symptoms using AI
const analyzeSymptomsWithAI = async (symptoms, petAge) => {
  try {
    const prompt = `You are a licensed veterinarian AI assistant. Analyze the following pet symptoms and provide a professional assessment.

Pet Age: ${petAge}
Appetite: ${symptoms.appetite}
Energy Level: ${symptoms.energy}
Vomiting: ${symptoms.vomiting ? "Yes" : "No"}
Additional Notes: ${symptoms.additionalNotes || "None"}

Based on these symptoms, provide:
1. Recommendation: Choose ONE of: "emergency", "appointment", or "home_care"
   - "emergency": Immediate veterinary attention required (life-threatening or severe)
   - "appointment": Schedule a veterinary visit within 24-48 hours
   - "home_care": Can be managed at home with monitoring

2. Urgency Level: "low", "medium", "high", or "critical"

3. Explanation: A brief professional explanation (2-3 sentences) of why this recommendation was made

4. Suggested Actions: A list of 3-5 specific actionable steps the owner should take

Respond ONLY with valid JSON in this exact format:
{
  "recommendation": "emergency|appointment|home_care",
  "urgency": "low|medium|high|critical",
  "explanation": "Your explanation here",
  "suggestedActions": ["Action 1", "Action 2", "Action 3"]
}`;

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    });

    // ===> 2- Handle different response structures
    let responseText = "";
    if (response?.response?.text) {
      responseText = response.response.text();
    } else if (response?.text) {
      responseText = response.text;
    } else if (typeof response === "string") {
      responseText = response;
    } else {
      throw new Error("Unexpected response format from AI");
    }

    // ===> 3- Extract JSON from response (handle markdown code blocks if present)
    let jsonText = responseText.trim();
    if (jsonText.includes("```json")) {
      jsonText = jsonText.split("```json")[1].split("```")[0].trim();
    } else if (jsonText.includes("```")) {
      jsonText = jsonText.split("```")[1].split("```")[0].trim();
    }

    const analysis = JSON.parse(jsonText);

    // ===> 4- Validate the response
    const validRecommendations = ["emergency", "appointment", "home_care"];
    const validUrgencies = ["low", "medium", "high", "critical"];

    if (!validRecommendations.includes(analysis.recommendation)) {
      analysis.recommendation = "appointment"; // Default to appointment if invalid
    }
    if (!validUrgencies.includes(analysis.urgency)) {
      analysis.urgency = "medium"; // Default to medium if invalid
    }

    return analysis;
  } catch (error) {
    console.error("AI Analysis Error:", error);
    // Fallback analysis based on symptoms
    return getFallbackAnalysis(symptoms);
  }
};

// ===> 5- Fallback analysis if AI fails
const getFallbackAnalysis = (symptoms) => {
  let recommendation = "home_care";
  let urgency = "low";
  let explanation = "Based on the symptoms provided, monitor your pet closely.";
  let suggestedActions = [
    "Monitor your pet's condition closely",
    "Ensure access to fresh water",
    "Contact a veterinarian if symptoms worsen",
  ];

  // ===> Emergency conditions
  if (
    symptoms.vomiting &&
    (symptoms.appetite === "none" || symptoms.energy === "very_low")
  ) {
    recommendation = "emergency";
    urgency = "critical";
    explanation =
      "Combination of vomiting with no appetite or very low energy may indicate a serious condition requiring immediate attention.";
    suggestedActions = [
      "Seek immediate veterinary emergency care",
      "Do not give food or water until seen by a vet",
      "Keep your pet warm and comfortable",
    ];
  }
  // ===> Appointment needed
  else if (
    symptoms.vomiting ||
    symptoms.appetite === "none" ||
    symptoms.energy === "very_low"
  ) {
    recommendation = "appointment";
    urgency = "high";
    explanation =
      "These symptoms suggest your pet should be evaluated by a veterinarian within 24-48 hours.";
    suggestedActions = [
      "Schedule a veterinary appointment",
      "Monitor symptoms and note any changes",
      "Keep a record of when symptoms started",
    ];
  }
  // ===> Home care
  else if (symptoms.appetite === "decreased" || symptoms.energy === "low") {
    recommendation = "home_care";
    urgency = "medium";
    explanation =
      "Mild symptoms that can be monitored at home, but watch for any worsening.";
    suggestedActions = [
      "Monitor your pet's eating and activity levels",
      "Ensure fresh water is always available",
      "Contact a vet if symptoms persist or worsen",
    ];
  }

  return {
    recommendation,
    urgency,
    explanation,
    suggestedActions,
  };
};

// ===> 6- Create a new symptom check
export const createSymptomCheck = catchAsyncError(async (req, res, next) => {
  const userId = req.authUser._id;
  const { petId, appetite, energy, vomiting, age, additionalNotes } = req.body;

  // ==> Validate required fields
  if (!petId || !appetite || !energy || vomiting === undefined || !age) {
    return next(
      new AppError(
        "Please provide: petId, appetite, energy, vomiting, and age",
        400
      )
    );
  }

  // ==> Verify pet belongs to user
  const pet = await Pet.findOne({ _id: petId, petOwner: userId });
  if (!pet) {
    return next(new AppError("Pet not found or does not belong to you", 404));
  }

  const symptoms = {
    appetite,
    energy,
    vomiting: Boolean(vomiting),
    age,
    additionalNotes: additionalNotes || "",
  };

  // ==> Analyze symptoms with AI
  const aiAnalysis = await analyzeSymptomsWithAI(symptoms, age);

  // ==> Create symptom check record
  const symptomCheck = await SymptomChecker.create({
    user: userId,
    pet: petId,
    symptoms,
    aiAnalysis,
  });

  // ===> populate pet details
  await symptomCheck.populate("pet", "name category age");

  res.status(201).json({
    success: true,
    message: "Symptom check completed successfully",
    data: symptomCheck,
  });
});

// ===> get all symptom checks for a user
export const getUserSymptomChecks = catchAsyncError(async (req, res, next) => {
  const userId = req.authUser._id;
  const { petId, limit = 10, page = 1 } = req.query;

  const query = { user: userId };
  if (petId) {
    query.pet = petId;
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const symptomChecks = await SymptomChecker.find(query)
    .populate("pet", "name category age image")
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .skip(skip);

  const total = await SymptomChecker.countDocuments(query);

  res.status(200).json({
    success: true,
    message: "Symptom checks retrieved successfully",
    data: symptomChecks,
    meta: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
    },
  });
});

// ===> get a specific symptom check
export const getSymptomCheckById = catchAsyncError(async (req, res, next) => {
  const userId = req.authUser._id;
  const { id } = req.params;

  const symptomCheck = await SymptomChecker.findOne({
    _id: id,
    user: userId,
  }).populate("pet", "name category age image");

  if (!symptomCheck) {
    return next(new AppError("Symptom check not found or access denied", 404));
  }

  res.status(200).json({
    success: true,
    message: "Symptom check retrieved successfully",
    data: symptomCheck,
  });
});

// ===> mark symptom check as resolved
export const markSymptomCheckResolved = catchAsyncError(
  async (req, res, next) => {
    const userId = req.authUser._id;
    const { id } = req.params;

    const symptomCheck = await SymptomChecker.findOneAndUpdate(
      { _id: id, user: userId },
      { isResolved: true, resolvedAt: new Date() },
      { new: true }
    ).populate("pet", "name category age");

    if (!symptomCheck) {
      return next(
        new AppError("Symptom check not found or access denied", 404)
      );
    }

    res.status(200).json({
      success: true,
      message: "Symptom check marked as resolved",
      data: symptomCheck,
    });
  }
);

// ===> get symptom check statistics for user
export const getSymptomCheckStats = catchAsyncError(async (req, res, next) => {
  const userId = req.authUser._id;

  const stats = await SymptomChecker.aggregate([
    { $match: { user: userId } },
    {
      $group: {
        _id: "$aiAnalysis.recommendation",
        count: { $sum: 1 },
      },
    },
  ]);

  const totalChecks = await SymptomChecker.countDocuments({ user: userId });
  const emergencyCount = stats.find((s) => s._id === "emergency")?.count || 0;
  const appointmentCount =
    stats.find((s) => s._id === "appointment")?.count || 0;
  const homeCareCount = stats.find((s) => s._id === "home_care")?.count || 0;

  res.status(200).json({
    success: true,
    data: {
      totalChecks,
      emergency: emergencyCount,
      appointment: appointmentCount,
      homeCare: homeCareCount,
    },
  });
});
