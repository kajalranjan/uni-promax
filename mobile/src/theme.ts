export const colors = {
  primary: '#8C1D40',       // maroon
  primaryPressed: '#6E1732',
  accent: '#FFC627',        // gold
  text: '#1D1D1F',
  muted: '#6B6B70',
  border: '#D6D6DA',
  background: '#FFFFFF',
  surface: '#F5F5F7',
  error: '#C62828',
  success: '#2E7D32',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

// Calendar entry colors: a soft fill with a strong left edge, like Google Calendar.
export const kindColors = {
  class: { fill: '#F6E3E9', edge: '#8C1D40', text: '#5A1229', label: 'Class' },
  study: { fill: '#FFF4D1', edge: '#D9A400', text: '#5C4500', label: 'AI study plan' },
  commitment: { fill: '#E4ECF7', edge: '#3F6CB0', text: '#1E3A66', label: 'Commitment' },
  event: { fill: '#E1F2EF', edge: '#2B8A7A', text: '#15473F', label: 'Event' },
  assignment: { fill: '#FDE7E4', edge: '#C62828', text: '#7A1A1A', label: 'Due' },
} as const;
