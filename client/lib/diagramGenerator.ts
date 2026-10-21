import type { WhiteboardElement } from "@shared/types";

export type DiagramStep = {
  title: string;
  subtitle?: string;
  color?: string;
};

export function generateDiagramFromPrompt(
  prompt: string,
  originX: number,
  originY: number
): WhiteboardElement[] {
  const lower = prompt.toLowerCase();

  // Pattern detection
  let steps: DiagramStep[] = [];
  let diagramTitle = prompt.trim();

  if (lower.includes("auth") || lower.includes("login") || lower.includes("oauth")) {
    diagramTitle = "OAuth 2.0 Authentication Flow";
    steps = [
      { title: "User Agent", subtitle: "Clicks 'Sign in with Google'", color: "#3b82f6" },
      { title: "Client App", subtitle: "Redirects to Auth Provider", color: "#6366f1" },
      { title: "Auth Server", subtitle: "Validates credentials & grants consent", color: "#8b5cf6" },
      { title: "Callback Token", subtitle: "Exchange auth code for JWT", color: "#ec4899" },
      { title: "API Gateway", subtitle: "Verify signature & grant session", color: "#10b981" }
    ];
  } else if (lower.includes("microservice") || lower.includes("architecture")) {
    diagramTitle = "Distributed Cloud Architecture";
    steps = [
      { title: "Client Apps", subtitle: "Mobile / Next.js Web", color: "#0ea5e9" },
      { title: "API Gateway", subtitle: "Rate limiting & SSL termination", color: "#3b82f6" },
      { title: "Core Services", subtitle: "Auth, Boards, Sync, AI", color: "#6366f1" },
      { title: "Event Bus", subtitle: "Socket.IO / Redis PubSub", color: "#eab308" },
      { title: "Persistence", subtitle: "MongoDB + Object Store", color: "#10b981" }
    ];
  } else if (lower.includes("checkout") || lower.includes("payment") || lower.includes("order")) {
    diagramTitle = "E-Commerce Checkout Pipeline";
    steps = [
      { title: "Cart Review", subtitle: "Calculate tax & shipping", color: "#3b82f6" },
      { title: "Payment Intent", subtitle: "Create Stripe PaymentIntent", color: "#8b5cf6" },
      { title: "3D Secure", subtitle: "Bank authentication step", color: "#f59e0b" },
      { title: "Inventory Reserve", subtitle: "Lock stock in warehouse", color: "#06b6d4" },
      { title: "Order Confirmed", subtitle: "Send webhook & email receipt", color: "#10b981" }
    ];
  } else if (lower.includes("ci") || lower.includes("cd") || lower.includes("deploy")) {
    diagramTitle = "CI / CD Deployment Pipeline";
    steps = [
      { title: "Git Push", subtitle: "Trigger GitHub Action", color: "#64748b" },
      { title: "Lint & Test", subtitle: "ESLint, Jest & TypeScript", color: "#3b82f6" },
      { title: "Docker Build", subtitle: "Multi-stage image compilation", color: "#6366f1" },
      { title: "Security Scan", subtitle: "Trivy vuln scan", color: "#f59e0b" },
      { title: "Deploy to Prod", subtitle: "Rolling Kubernetes update", color: "#10b981" }
    ];
  } else {
    // Generic multi-step synthesis from user input
    // Split prompt by commas, arrows ("->"), or words
    const parts = prompt
      .split(/(?:->|-->|,|\bthen\b|\band\b)/i)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const colors = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4"];

    if (parts.length >= 2) {
      steps = parts.map((part, index) => ({
        title: part.slice(0, 24),
        subtitle: part.length > 24 ? part.slice(24, 60) : `Phase ${index + 1}`,
        color: colors[index % colors.length]
      }));
    } else {
      steps = [
        { title: prompt.slice(0, 22) || "Step 1", subtitle: "Initiate process", color: "#3b82f6" },
        { title: "Process Data", subtitle: "Validate and transform", color: "#8b5cf6" },
        { title: "Execute Action", subtitle: "Run primary operation", color: "#f59e0b" },
        { title: "Verify Output", subtitle: "Persist results & notify", color: "#10b981" }
      ];
    }
  }

  const elements: WhiteboardElement[] = [];

  // Title element
  elements.push({
    id: crypto.randomUUID(),
    type: "text",
    x: originX,
    y: originY,
    width: 500,
    height: 40,
    strokeColor: "#f1f5f9",
    strokeWidth: 1,
    fontSize: 24,
    text: `⚡ ${diagramTitle}`,
    points: []
  });

  const stepWidth = 190;
  const stepHeight = 85;
  const arrowGap = 60;
  const startY = originY + 60;

  steps.forEach((step, index) => {
    const x = originX + index * (stepWidth + arrowGap);
    const y = startY;

    // Node Box
    const rectId = crypto.randomUUID();
    elements.push({
      id: rectId,
      type: "rectangle",
      x,
      y,
      width: stepWidth,
      height: stepHeight,
      strokeColor: step.color || "#6366f1",
      fillColor: `${step.color || "#6366f1"}1a`, // ~10% opacity hex
      strokeWidth: 2,
      points: []
    });

    // Step Title & Subtitle inside Node
    elements.push({
      id: crypto.randomUUID(),
      type: "text",
      x: x + 14,
      y: y + 16,
      width: stepWidth - 28,
      height: 30,
      strokeColor: "#ffffff",
      strokeWidth: 1,
      fontSize: 15,
      text: `${index + 1}. ${step.title}`,
      points: []
    });

    if (step.subtitle) {
      elements.push({
        id: crypto.randomUUID(),
        type: "text",
        x: x + 14,
        y: y + 46,
        width: stepWidth - 28,
        height: 25,
        strokeColor: "#94a3b8",
        strokeWidth: 1,
        fontSize: 11,
        text: step.subtitle,
        points: []
      });
    }

    // Connector Arrow to next step
    if (index < steps.length - 1) {
      elements.push({
        id: crypto.randomUUID(),
        type: "arrow",
        x: x + stepWidth + 6,
        y: y + stepHeight / 2,
        width: arrowGap - 12,
        height: 0,
        strokeColor: "#64748b",
        strokeWidth: 2,
        points: []
      });
    }
  });

  return elements;
}
