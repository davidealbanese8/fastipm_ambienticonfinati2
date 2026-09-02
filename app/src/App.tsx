import { AppProvider } from './state/AppContext';
import { LoginGate } from './components/LoginGate/LoginGate';
import { AppShell } from './components/AppShell/AppShell';

function App() {
  return (
    <LoginGate>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </LoginGate>
  );
}

export default App;
