import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the teacher portal', () => {
  render(<App />);
  expect(screen.getByText(/gestion des absences/i)).toBeInTheDocument();
  expect(screen.getByText(/portail enseignant/i)).toBeInTheDocument();
});
