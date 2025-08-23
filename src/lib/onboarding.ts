export type Q = { id: string; label: string; placeholder?: string; type?: 'text'|'select'; options?: {label:string; value:string}[] };

export const QUESTIONS: Q[] = [
  { id: 'project_name', label: 'What is your app called?' },
  { id: 'audience', label: 'Who is it for? (be specific)' },
  { id: 'core_value', label: 'What problem does it solve in one sentence?' },
  { id: 'hours_per_day', label: 'How many hours per day can you commit?', placeholder: 'e.g., 2' },
  { id: 'image_api', label: 'Which image service do you want to start with?', type: 'select', options: [
      { label: 'fal.ai (recommended to start)', value: 'fal' },
      { label: 'Replicate', value: 'replicate' },
      { label: 'Other / not sure yet', value: 'unknown' }
  ] }
];