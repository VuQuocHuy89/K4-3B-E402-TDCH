"use strict";

const officialSources = [
  {
    id: "official-google-linear-regression",
    title: "Linear regression",
    publisher: "Google for Developers",
    url: "https://developers.google.com/machine-learning/crash-course/linear-regression",
    domain: "developers.google.com",
    type: "Official course",
    topics: ["regression", "linear regression", "loss", "gradient descent", "features", "label"],
    summary: "Bài học chính thức về linear regression, feature, label, loss và cách tối ưu tham số.",
  },
  {
    id: "official-google-classification-metrics",
    title: "Classification metrics: accuracy, precision, recall",
    publisher: "Google for Developers",
    url: "https://developers.google.com/machine-learning/crash-course/classification/accuracy-precision-recall",
    domain: "developers.google.com",
    type: "Official course",
    topics: ["classification", "accuracy", "precision", "recall", "imbalanced data", "evaluation"],
    summary: "Giải thích các metric classification và cách chọn theo loại lỗi, chi phí và dữ liệu mất cân bằng.",
  },
  {
    id: "official-google-mlcc",
    title: "Machine Learning Crash Course",
    publisher: "Google for Developers",
    url: "https://developers.google.com/machine-learning/crash-course",
    domain: "developers.google.com",
    type: "Official course",
    topics: ["machine learning", "ml foundations", "classification", "regression", "evaluation", "neural networks"],
    summary: "Khóa học chính thức của Google về nền tảng ML, dữ liệu, model và đánh giá.",
  },
  {
    id: "official-sklearn-model-selection",
    title: "Model selection and evaluation",
    publisher: "scikit-learn",
    url: "https://scikit-learn.org/stable/model_selection.html",
    domain: "scikit-learn.org",
    type: "Official documentation",
    topics: ["validation", "cross validation", "model selection", "evaluation", "metrics", "overfitting"],
    summary: "Tài liệu chính thức về cross-validation, chọn model, tuning và các metric đánh giá.",
  },
  {
    id: "official-sklearn-linear-models",
    title: "Linear models",
    publisher: "scikit-learn",
    url: "https://scikit-learn.org/stable/modules/linear_model.html",
    domain: "scikit-learn.org",
    type: "Official documentation",
    topics: ["regression", "linear regression", "logistic regression", "regularization", "classification"],
    summary: "Tài liệu API và hướng dẫn về linear models, regression, classification và regularization.",
  },
  {
    id: "official-sklearn-ensemble",
    title: "Ensemble methods",
    publisher: "scikit-learn",
    url: "https://scikit-learn.org/stable/modules/ensemble.html",
    domain: "scikit-learn.org",
    type: "Official documentation",
    topics: ["ensemble", "random forest", "gradient boosting", "decision trees", "model families"],
    summary: "Tài liệu chính thức về random forest, gradient boosting và các phương pháp ensemble.",
  },
  {
    id: "official-sklearn-guide",
    title: "scikit-learn User Guide",
    publisher: "scikit-learn",
    url: "https://scikit-learn.org/stable/user_guide.html",
    domain: "scikit-learn.org",
    type: "Official documentation",
    topics: ["regression", "classification", "model evaluation", "validation", "preprocessing", "model selection"],
    summary: "Tài liệu chính thức về thuật toán, preprocessing, model selection và evaluation.",
  },
  {
    id: "official-pytorch-tutorials",
    title: "PyTorch Tutorials",
    publisher: "PyTorch",
    url: "https://pytorch.org/tutorials/",
    domain: "pytorch.org",
    type: "Official tutorials",
    topics: ["neural networks", "deep learning", "training", "pytorch", "model"],
    summary: "Tutorial và ví dụ thực hành chính thức để xây và train model bằng PyTorch.",
  },
  {
    id: "official-tensorflow-guides",
    title: "TensorFlow Guides",
    publisher: "TensorFlow",
    url: "https://www.tensorflow.org/guide",
    domain: "tensorflow.org",
    type: "Official documentation",
    topics: ["neural networks", "deep learning", "training", "tensorflow", "model"],
    summary: "Hướng dẫn chính thức về TensorFlow, Keras, data pipeline và model training.",
  },
  {
    id: "official-huggingface-course",
    title: "Hugging Face Course",
    publisher: "Hugging Face",
    url: "https://huggingface.co/learn/nlp-course/chapter1/1",
    domain: "huggingface.co",
    type: "Official course",
    topics: ["transformers", "nlp", "llm", "fine-tuning", "datasets"],
    summary: "Khóa học chính thức về Transformers, datasets, fine-tuning và NLP hiện đại.",
  },
  {
    id: "official-python-tutorial",
    title: "The Python Tutorial",
    publisher: "Python Software Foundation",
    url: "https://docs.python.org/3/tutorial/",
    domain: "docs.python.org",
    type: "Official documentation",
    topics: ["python", "programming", "ai engineer", "data"],
    summary: "Tài liệu chính thức để củng cố Python trước khi học các thư viện ML.",
  },
  {
    id: "official-kaggle-learn",
    title: "Kaggle Learn",
    publisher: "Kaggle",
    url: "https://www.kaggle.com/learn",
    domain: "kaggle.com",
    type: "Official learning platform",
    topics: ["python", "pandas", "machine learning", "feature engineering", "exercises"],
    summary: "Các micro-course và bài thực hành phù hợp để chuyển kiến thức thành kỹ năng.",
  },
];

const allowedDomains = new Set(officialSources.map((source) => source.domain));
for (const domain of ["docs.langchain.com", "python.langchain.com", "docs.llamaindex.ai", "platform.openai.com", "docs.anthropic.com", "developer.mozilla.org", "learn.microsoft.com", "numpy.org", "pandas.pydata.org"]) allowedDomains.add(domain);
const normalise = (value) => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const queryTerms = (value) => normalise(value).split(/[^a-z0-9]+/).filter((term) => term.length > 2);

const discoverCatalogSources = (query, maxResults = 5) => {
  const terms = queryTerms(query);
  return [...officialSources]
    .map((source) => ({
      ...source,
      score: terms.reduce((score, term) => score + (source.topics.some((topic) => normalise(topic).includes(term)) ? 2 : 0) + (normalise(source.title).includes(term) ? 1 : 0), 0),
      provenance: "curated-catalog",
      verified: true,
      why_selected: "Nguồn nằm trong allowlist tài liệu chính thống của Pathwise và phù hợp với chủ đề section.",
    }))
    .filter((source) => source.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, maxResults)
    .map(({ score, topics, ...source }) => source);
};

const isAllowedUrl = (value) => {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.replace(/^www\./, "");
    return parsed.protocol === "https:" && !parsed.username && !parsed.password && (!parsed.port || parsed.port === "443") && (allowedDomains.has(hostname) || hostname === "arxiv.org" || hostname.endsWith(".edu") || hostname.endsWith(".edu.vn"));
  } catch {
    return false;
  }
};

const sanitizeSources = (items, maxResults = 5) => {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => item && typeof item === "object").map((item, index) => ({
    id: String(item.id || `web-source-${index + 1}`).slice(0, 80),
    title: String(item.title || "Untitled source").slice(0, 180),
    publisher: String(item.publisher || item.domain || "Unknown publisher").slice(0, 100),
    url: String(item.url || ""),
    domain: String(item.domain || "").replace(/^www\./, ""),
    type: String(item.type || "Official reference").slice(0, 80),
    summary: String(item.summary || "").slice(0, 500),
    why_selected: String(item.why_selected || "Được chọn vì có liên quan tới section đang học.").slice(0, 300),
    provenance: String(item.provenance || "web-grounded").slice(0, 40),
    verified: isAllowedUrl(item.url),
  })).filter((item) => item.verified).slice(0, maxResults);
};

module.exports = { officialSources, allowedDomains, discoverCatalogSources, sanitizeSources };
