"use strict";

const text = (value) => String(value || "").trim();

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || min));

const sectionQuestionCount = (section = {}) => clamp(
  Math.ceil(((section.concepts?.length || 0) + (section.checklist?.length || 0)) / 3),
  1,
  3,
);

const assessmentCountForSections = (mode, inputSections = [], sectionId = "") => {
  if (mode === "mastery") {
    const section = inputSections.find((item) => item.id === sectionId) || inputSections[0];
    return clamp(Math.max(3, (section?.concepts?.length || section?.checklist?.length || 2) * 2), 3, 8);
  }
  const diagnostic = inputSections.reduce((total, section) => total + sectionQuestionCount(section), 0);
  const minimum = Math.max(mode === "final" ? 6 : 4, inputSections.length || 1);
  return mode === "final"
    ? clamp(Math.ceil(diagnostic / 2), minimum, 24)
    : clamp(diagnostic, minimum, 24);
};

const validateAssessmentQuestion = (question, {
  mode = "diagnostic",
  index = 0,
  section,
  sourceIds = [],
  seenPrompts = new Set(),
}) => {
  if (!section || !question || typeof question !== "object") return null;
  const options = Array.isArray(question.options)
    ? question.options.map((option) => text(option)).filter(Boolean).slice(0, 4)
    : [];
  const prompt = text(question.prompt);
  const explanation = text(question.explanation);
  const correctIndex = Number(question.correct_index ?? question.correctIndex);
  const promptKey = prompt.toLocaleLowerCase();
  const uniqueOptions = new Set(options.map((option) => option.toLocaleLowerCase()));
  const scopedSourceIds = new Set((section.source_ids || section.sourceIds || []).filter(Boolean));
  const validSourceIds = [...new Set(sourceIds.filter((id) => !scopedSourceIds.size || scopedSourceIds.has(id)))];

  if (
    prompt.length < 15
    || options.length !== 4
    || uniqueOptions.size !== 4
    || !Number.isInteger(correctIndex)
    || correctIndex < 0
    || correctIndex > 3
    || explanation.length < 15
    || !validSourceIds.length
    || seenPrompts.has(promptKey)
  ) return null;

  return {
    id: text(question.id) || `${mode}-${index + 1}`,
    prompt,
    options,
    correctIndex,
    explanation,
    sourceIds: validSourceIds,
    promptKey,
  };
};

module.exports = { clamp, sectionQuestionCount, assessmentCountForSections, validateAssessmentQuestion };
