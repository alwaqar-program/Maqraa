import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth, AppRole } from "@/contexts/AuthContext";
import AppLayout from "./components/layout/AppLayout";
import LoginPage from "./pages/LoginPage";
import NotFound from "./pages/NotFound";
import Placeholder from "./pages/Placeholder";
import TracksPage from "./pages/admin/TracksPage";
import SeasonsPage from "./pages/admin/SeasonsPage";
import SchedulingPage from "./pages/admin/SchedulingPage";
import TeacherAvailabilityPage from "./pages/teacher/TeacherAvailabilityPage";
import StudentBookingPage from "./pages/student/StudentBookingPage";
import SardPage from "./pages/student/SardPage";
import TasmeePage from "./pages/teacher/TasmeePage";
import StudentHomePage from "./pages/student/StudentHomePage";
import HistoryPage from "./pages/student/HistoryPage";
import TeacherHomePage from "./pages/teacher/TeacherHomePage";
import StudentsPage from "./pages/admin/StudentsPage";
import TeachersPage from "./pages/admin/TeachersPage";
import ReportsPage from "./pages/admin/ReportsPage";
import DashboardPage from "./pages/admin/DashboardPage";
import RegisterPage from "./pages/RegisterPage";
import ApplicantsPage from "./pages/admin/ApplicantsPage";
import RecitationAdminPage from "./pages/admin/RecitationAdminPage";
import AttendanceAdminPage from "./pages/admin/AttendanceAdminPage";
import ExamsAdminPage from "./pages/admin/ExamsAdminPage";
import PledgesAdminPage from "./pages/admin/PledgesAdminPage";
import UsersPage from "./pages/admin/UsersPage";
import SettingsPage from "./pages/admin/SettingsPage";
import MyPledgesPage from "./pages/student/MyPledgesPage";
import TeacherExamsPage from "./pages/teacher/TeacherExamsPage";
import TeacherStudentsPage from "./pages/teacher/TeacherStudentsPage";
import SuggestionBoxPage from "./pages/SuggestionBoxPage";
import SuggestionsAdminPage from "./pages/admin/SuggestionsAdminPage";
import HostingsAdminPage from "./pages/admin/HostingsAdminPage";
import StudentHostingsPage from "./pages/student/StudentHostingsPage";
import GuestHostingPage from "./pages/GuestHostingPage";
import logoImg from '@/assets/logo-maqraa.png';

const queryClient = new QueryClient();

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: AppRole[] }) {
  const { user, loading, roles: userRoles, homePath } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <img src={logoImg} alt="شعار مقرأة الوقار" className="w-16 h-16 object-contain mx-auto" />
          <p className="text-muted-foreground text-sm">جارٍ التحميل...</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  // من يفتح مسارًا ليس لدوره يُعاد لوجهته الرئيسية (الحماية الحقيقية في RLS)
  if (roles && !roles.some(r => userRoles.includes(r))) {
    return <Navigate to={homePath} replace />;
  }
  return <AppLayout>{children}</AppLayout>;
}

/** الجذر: المديرة ترى اللوحة، وبقية الأدوار تُوجَّه لوجهتها */
function RootRoute() {
  const { roles, homePath } = useAuth();
  if (roles.includes('admin')) {
    return <DashboardPage />;
  }
  return <Navigate to={homePath} replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* عام */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/register-teacher" element={<Placeholder title="تسجيل المسمعات" />} />
            <Route path="/guest/:token" element={<GuestHostingPage />} />
            <Route path="/certificate" element={<Placeholder title="التحقق من الشهادات" />} />

            {/* الجذر حسب الدور */}
            <Route path="/" element={<ProtectedRoute><RootRoute /></ProtectedRoute>} />

            {/* الإدارة */}
            <Route path="/students" element={<ProtectedRoute roles={['admin']}><StudentsPage /></ProtectedRoute>} />
            <Route path="/students/:id" element={<ProtectedRoute roles={['admin']}><Placeholder title="ملف الطالبة" /></ProtectedRoute>} />
            <Route path="/teachers" element={<ProtectedRoute roles={['admin']}><TeachersPage /></ProtectedRoute>} />
            <Route path="/applicants" element={<ProtectedRoute roles={['admin']}><ApplicantsPage /></ProtectedRoute>} />
            <Route path="/scheduling" element={<ProtectedRoute roles={['admin']}><SchedulingPage /></ProtectedRoute>} />
            <Route path="/recitation" element={<ProtectedRoute roles={['admin']}><RecitationAdminPage /></ProtectedRoute>} />
            <Route path="/attendance" element={<ProtectedRoute roles={['admin']}><AttendanceAdminPage /></ProtectedRoute>} />
            <Route path="/exams" element={<ProtectedRoute roles={['admin']}><ExamsAdminPage /></ProtectedRoute>} />
            <Route path="/tracks" element={<ProtectedRoute roles={['admin']}><TracksPage /></ProtectedRoute>} />
            <Route path="/seasons" element={<ProtectedRoute roles={['admin']}><SeasonsPage /></ProtectedRoute>} />
            <Route path="/hostings" element={<ProtectedRoute roles={['admin']}><HostingsAdminPage /></ProtectedRoute>} />
            <Route path="/pledges" element={<ProtectedRoute roles={['admin']}><PledgesAdminPage /></ProtectedRoute>} />
            <Route path="/violations" element={<ProtectedRoute roles={['admin']}><Placeholder title="المخالفات" /></ProtectedRoute>} />
            <Route path="/suggestions" element={<ProtectedRoute roles={['admin', 'supervisor']}><SuggestionsAdminPage /></ProtectedRoute>} />
            <Route path="/certificates" element={<ProtectedRoute roles={['admin']}><Placeholder title="الشهادات" /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute roles={['admin', 'report_viewer']}><ReportsPage /></ProtectedRoute>} />
            <Route path="/activity-log" element={<ProtectedRoute roles={['admin']}><Placeholder title="سجل النشاط" /></ProtectedRoute>} />
            <Route path="/users" element={<ProtectedRoute roles={['admin']}><UsersPage /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute roles={['admin']}><SettingsPage /></ProtectedRoute>} />

            {/* المسمعة */}
            <Route path="/teacher" element={<ProtectedRoute roles={['teacher']}><TeacherHomePage /></ProtectedRoute>} />
            <Route path="/teacher/availability" element={<ProtectedRoute roles={['teacher']}><TeacherAvailabilityPage /></ProtectedRoute>} />
            <Route path="/teacher/tasmee" element={<ProtectedRoute roles={['teacher']}><TasmeePage /></ProtectedRoute>} />
            <Route path="/teacher/attendance" element={<ProtectedRoute roles={['teacher']}><Placeholder title="الحضور" /></ProtectedRoute>} />
            <Route path="/teacher/exams" element={<ProtectedRoute roles={['teacher']}><TeacherExamsPage /></ProtectedRoute>} />
            <Route path="/teacher/students" element={<ProtectedRoute roles={['teacher']}><TeacherStudentsPage /></ProtectedRoute>} />
            <Route path="/teacher/suggestions" element={<ProtectedRoute roles={['teacher']}><SuggestionBoxPage /></ProtectedRoute>} />

            {/* المشرفة */}
            <Route path="/supervisor" element={<ProtectedRoute roles={['supervisor']}><Placeholder title="متابعة المسارات" /></ProtectedRoute>} />

            {/* الطالبة */}
            <Route path="/me" element={<ProtectedRoute roles={['student']}><StudentHomePage /></ProtectedRoute>} />
            <Route path="/me/sard" element={<ProtectedRoute roles={['student']}><SardPage /></ProtectedRoute>} />
            <Route path="/me/booking" element={<ProtectedRoute roles={['student']}><StudentBookingPage /></ProtectedRoute>} />
            <Route path="/me/history" element={<ProtectedRoute roles={['student']}><HistoryPage /></ProtectedRoute>} />
            <Route path="/me/pledges" element={<ProtectedRoute roles={['student']}><MyPledgesPage /></ProtectedRoute>} />
            <Route path="/me/hostings" element={<ProtectedRoute roles={['student']}><StudentHostingsPage /></ProtectedRoute>} />
            <Route path="/me/suggestions" element={<ProtectedRoute roles={['student']}><SuggestionBoxPage /></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
