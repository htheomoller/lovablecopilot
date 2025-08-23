/* Why: Guided persistent onboarding with session management */
export type AnswerStyle = 'eli5' | 'intermediate' | 'developer';
export type QuestionType = 'text' | 'multi-select' | 'single-select';

export interface Question {
  id: string;
  prompt: string;
  key: string;
  type: QuestionType;
  options?: string[];
  required?: boolean;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ChatSession {
  step: number;
  answerStyle: AnswerStyle;
  answers: Record<string, any>;
  messages: Message[];
  completed: boolean;
  timestamp: number;
}

export const QUESTIONS: Question[] = [
  {
    id: 'app_idea',
    prompt: "What's your app idea in one line?",
    key: 'idea',
    type: 'text',
    required: true
  },
  {
    id: 'audience',
    prompt: "Who is it for? (your ideal customer/user)",
    key: 'audience',
    type: 'text',
    required: true
  },
  {
    id: 'features',
    prompt: "Top 3 must-have features",
    key: 'features',
    type: 'multi-select',
    options: [
      'User authentication',
      'Real-time messaging',
      'File uploads',
      'Payment processing',
      'Search functionality',
      'Notifications',
      'Dashboard/Analytics',
      'Social features',
      'API integration',
      'Mobile responsive'
    ]
  },
  {
    id: 'privacy',
    prompt: "Data visibility preference",
    key: 'privacy',
    type: 'single-select',
    options: ['Private', 'Share via link', 'Public']
  },
  {
    id: 'auth',
    prompt: "Authentication preference",
    key: 'auth',
    type: 'single-select',
    options: ['Google OAuth', 'Magic email link', 'None (dev only)']
  },
  {
    id: 'deep_work_hours',
    prompt: "Daily focused work hours",
    key: 'deep_work_hours',
    type: 'single-select',
    options: ['0.5', '1', '2', '4+']
  }
];

const SESSION_KEY = 'cp_chat_session_v1';

export function defaultSession(): ChatSession {
  return {
    step: -1, // -1 = needs answer style, 0+ = question index
    answerStyle: 'eli5',
    answers: {},
    messages: [{
      id: 'greeting',
      role: 'assistant',
      content: "Hi, I'm your Copilot. First, how technical should I be? Choose: ELI5, Intermediate, or Developer.",
      timestamp: new Date()
    }],
    completed: false,
    timestamp: Date.now()
  };
}

export function loadSession(): ChatSession {
  try {
    const saved = localStorage.getItem(SESSION_KEY);
    if (!saved) return defaultSession();
    
    const parsed = JSON.parse(saved);
    // Restore Date objects
    parsed.messages = parsed.messages.map((msg: any) => ({
      ...msg,
      timestamp: new Date(msg.timestamp)
    }));
    
    return parsed;
  } catch {
    return defaultSession();
  }
}

export function saveSession(session: ChatSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      ...session,
      timestamp: Date.now()
    }));
  } catch (error) {
    console.warn('Failed to save chat session:', error);
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function hasStoredSession(): boolean {
  return localStorage.getItem(SESSION_KEY) !== null;
}

export function addMessage(session: ChatSession, role: 'user' | 'assistant', content: string): ChatSession {
  const message: Message = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    role,
    content,
    timestamp: new Date()
  };
  
  return {
    ...session,
    messages: [...session.messages, message],
    timestamp: Date.now()
  };
}

export function generateMilestones(answers: Record<string, any>, userId: string) {
  const deepWorkMultiplier = {
    '0.5': 2.0,
    '1': 1.5,
    '2': 1.0,
    '4+': 0.8
  }[answers.deep_work_hours] || 1.0;

  const authComplexity = {
    'Google OAuth': 3,
    'Magic email link': 2,
    'None (dev only)': 1
  }[answers.auth] || 2;

  const privacyComplexity = {
    'Private': 1,
    'Share via link': 2,
    'Public': 3
  }[answers.privacy] || 2;

  const baseDate = new Date();
  const addDays = (days: number) => {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + Math.ceil(days * deepWorkMultiplier));
    return date.toISOString().split('T')[0];
  };

  let currentDay = 0;

  return [
    {
      id: `setup-${Date.now()}`,
      project: answers.idea?.slice(0, 50) || 'My App',
      name: 'Setup & Auth',
      status: 'planned',
      duration_days: Math.ceil((3 + authComplexity) * deepWorkMultiplier),
      owner_id: userId,
      start_date: addDays(currentDay)
    },
    {
      id: `core-${Date.now() + 1}`,
      project: answers.idea?.slice(0, 50) || 'My App',
      name: 'Core Features',
      status: 'planned',
      duration_days: Math.ceil((5 + (answers.features?.length || 3) * 1.5) * deepWorkMultiplier),
      owner_id: userId,
      start_date: addDays(currentDay += Math.ceil((3 + authComplexity) * deepWorkMultiplier))
    },
    {
      id: `polish-${Date.now() + 2}`,
      project: answers.idea?.slice(0, 50) || 'My App',
      name: 'Polish & Deploy',
      status: 'planned',
      duration_days: Math.ceil((2 + privacyComplexity) * deepWorkMultiplier),
      owner_id: userId,
      start_date: addDays(currentDay += Math.ceil((5 + (answers.features?.length || 3) * 1.5) * deepWorkMultiplier))
    },
    {
      id: `health-${Date.now() + 3}`,
      project: answers.idea?.slice(0, 50) || 'My App',
      name: 'Health & Monitoring',
      status: 'planned',
      duration_days: Math.ceil(2 * deepWorkMultiplier),
      owner_id: userId,
      start_date: addDays(currentDay += Math.ceil((2 + privacyComplexity) * deepWorkMultiplier))
    }
  ];
}