import React, { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { CompanyProvider } from "./contexts/CompanyContext";
import ProtectedRoute from "./components/ProtectedRoute";

const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const CompanySelection = lazy(() => import("./pages/CompanySelection"));
const CreateCompany = lazy(() => import("./pages/CreateCompany"));
const CompanyLogin = lazy(() => import("./pages/CompanyLogin"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const NotFound = lazy(() => import("./pages/NotFound"));
const VoucherForm = lazy(() => import("./pages/forms/VoucherForm"));
const LedgerMaster = lazy(() => import("./pages/masters/LedgerMaster"));
const ItemMaster = lazy(() => import("./pages/masters/ItemMaster"));
const UOMMaster = lazy(() => import("./pages/masters/UOMMaster"));
const GroupMaster = lazy(() => import("./pages/masters/GroupMaster"));
const StockGroupMaster = lazy(() => import("./pages/masters/StockGroupMaster"));
const StockCategoryMaster = lazy(
  () => import("./pages/masters/StockCategoryMaster"),
);
const VoucherTypeMaster = lazy(() => import("./pages/masters/VoucherTypeMaster"));
const CompanyProfile = lazy(() => import("./pages/CompanyProfile"));
const Settings = lazy(() => import("./pages/Settings"));
const Reports = lazy(() => import("./pages/reports/Reports"));
const ProfitLossReport = lazy(() => import("./pages/reports/ProfitLossReport"));
const BalanceSheetReport = lazy(
  () => import("./pages/reports/BalanceSheetReport"),
);
const TrialBalanceReport = lazy(() => import("./pages/reports/TrialBalanceReport"));
const GroupSummaryReport = lazy(() => import("./pages/reports/GroupSummaryReport"));
const LedgerReport = lazy(() => import("./pages/reports/LedgerReport"));
const GroupVouchersReport = lazy(() => import("./pages/reports/GroupVouchersReport"));
const SalesRegisterReport = lazy(() => import("./pages/reports/SalesRegisterReport"));
const PurchaseRegisterReport = lazy(
  () => import("./pages/reports/PurchaseRegisterReport"),
);
const VoucherHistoryReport = lazy(() => import("./pages/reports/VoucherHistoryReport"));
const StockSummaryReport = lazy(() => import("./pages/reports/StockSummaryReport"));
const StockItemVouchersReport = lazy(
  () => import("./pages/reports/StockItemVouchersReport"),
);
const BatchSummaryReport = lazy(() => import("./pages/reports/BatchSummaryReport"));
const OutstandingReceivableReport = lazy(
  () => import("./pages/reports/OutstandingReceivableReport"),
);
const OutstandingPayableReport = lazy(
  () => import("./pages/reports/OutstandingPayableReport"),
);

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">
    Loading...
  </div>
);

// const DashboardButton = () => {
//   const { currentSession } = useCompany();
//   const location = useLocation();
//   if (!currentSession) return null;
//   const isOnDashboard = location.pathname.startsWith("/dashboard");
//   if (isOnDashboard) return null;
  
//   return (
//     <Link to="/dashboard" className="fixed top-4 left-4 z-50">
//       <Button variant="secondary" size="sm">
//         <LayoutDashboard className="mr-2 h-4 w-4" />
//         Dashboard
//       </Button>
//     </Link>
//   );
// };

const App: React.FC = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <CompanyProvider>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                
                {/* Company Management Routes */}
                <Route path="/company-selection" element={
                  <ProtectedRoute>
                    <CompanySelection />
                  </ProtectedRoute>
                } />
                <Route path="/create-company" element={
                  <ProtectedRoute>
                    <CreateCompany />
                  </ProtectedRoute>
                } />
                <Route path="/company-login" element={
                  <ProtectedRoute>
                    <CompanyLogin />
                  </ProtectedRoute>
                } />

                {/* Application Routes - Require Company Login */}
                <Route path="/dashboard" element={
                  <ProtectedRoute requireCompanyLogin>
                    <Dashboard />
                  </ProtectedRoute>
                } />
                <Route path="/vouchers" element={
                  <ProtectedRoute requireCompanyLogin>
                    <VoucherForm />
                  </ProtectedRoute>
                } />
                <Route path="/sales" element={<Navigate to="/vouchers" replace />} />
                <Route path="/credit-note" element={<Navigate to="/vouchers" replace />} />
                <Route path="/purchase" element={<Navigate to="/vouchers" replace />} />
                <Route path="/debit-note" element={<Navigate to="/vouchers" replace />} />
                <Route path="/payment" element={<Navigate to="/vouchers" replace />} />
                <Route path="/receipt" element={<Navigate to="/vouchers" replace />} />
                <Route path="/groups" element={
                  <ProtectedRoute requireCompanyLogin>
                    <GroupMaster />
                  </ProtectedRoute>
                } />
                <Route path="/ledger-master" element={
                  <ProtectedRoute requireCompanyLogin>
                    <LedgerMaster />
                  </ProtectedRoute>
                } />
                <Route path="/item-master" element={
                  <ProtectedRoute requireCompanyLogin>
                    <ItemMaster />
                  </ProtectedRoute>
                } />
                <Route path="/uom-master" element={
                  <ProtectedRoute requireCompanyLogin>
                    <UOMMaster />
                  </ProtectedRoute>
                } />
                <Route path="/stock-group-master" element={
                  <ProtectedRoute requireCompanyLogin>
                    <StockGroupMaster />
                  </ProtectedRoute>
                } />
                <Route path="/stock-category-master" element={
                  <ProtectedRoute requireCompanyLogin>
                    <StockCategoryMaster />
                  </ProtectedRoute>
                } />
                <Route path="/voucher-types" element={
                  <ProtectedRoute requireCompanyLogin>
                    <VoucherTypeMaster />
                  </ProtectedRoute>
                } />
                <Route path="/company-profile" element={
                  <ProtectedRoute requireCompanyLogin>
                    <CompanyProfile />
                  </ProtectedRoute>
                } />
                <Route path="/settings" element={
                  <ProtectedRoute requireCompanyLogin>
                    <Settings />
                  </ProtectedRoute>
                } />
                <Route path="/reports" element={
                  <ProtectedRoute requireCompanyLogin>
                    <Reports />
                  </ProtectedRoute>
                } />
                <Route path="/reports/profit-loss" element={
                  <ProtectedRoute requireCompanyLogin>
                    <ProfitLossReport />
                  </ProtectedRoute>
                } />
                <Route path="/reports/balance-sheet" element={
                  <ProtectedRoute requireCompanyLogin>
                    <BalanceSheetReport />
                  </ProtectedRoute>
                } />
                <Route path="/reports/trial-balance" element={
                  <ProtectedRoute requireCompanyLogin>
                    <TrialBalanceReport />
                  </ProtectedRoute>
                } />
                <Route path="/reports/group-summary" element={
                  <ProtectedRoute requireCompanyLogin>
                    <GroupSummaryReport />
                  </ProtectedRoute>
                } />
                <Route path="/reports/ledger" element={
                  <ProtectedRoute requireCompanyLogin>
                    <LedgerReport />
                  </ProtectedRoute>
                 } />
                <Route path="/reports/group-vouchers" element={
                  <ProtectedRoute requireCompanyLogin>
                    <GroupVouchersReport />
                  </ProtectedRoute>
                 } />
                <Route path="/reports/sales-register" element={
                  <ProtectedRoute requireCompanyLogin>
                    <SalesRegisterReport />
                  </ProtectedRoute>
                 } />
                 <Route path="/reports/purchase-register" element={
                   <ProtectedRoute requireCompanyLogin>
                     <PurchaseRegisterReport />
                   </ProtectedRoute>
                  } />
                 <Route path="/reports/voucher-history" element={
                   <ProtectedRoute requireCompanyLogin>
                     <VoucherHistoryReport />
                   </ProtectedRoute>
                  } />
                 <Route path="/reports/stock-summary" element={
                   <ProtectedRoute requireCompanyLogin>
                     <StockSummaryReport />
                   </ProtectedRoute>
                  } />
                  <Route path="/reports/stock-item-vouchers" element={
                     <ProtectedRoute requireCompanyLogin>
                       <StockItemVouchersReport />
                     </ProtectedRoute>
                    } />
                   <Route path="/reports/batch-summary" element={
                     <ProtectedRoute requireCompanyLogin>
                       <BatchSummaryReport />
                     </ProtectedRoute>
                    } />
                 <Route path="/reports/outstanding-receivable" element={
                   <ProtectedRoute requireCompanyLogin>
                     <OutstandingReceivableReport />
                   </ProtectedRoute>
                  } />
                 <Route path="/reports/outstanding-payable" element={
                   <ProtectedRoute requireCompanyLogin>
                     <OutstandingPayableReport />
                   </ProtectedRoute>
                  } />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>

              {/* Global Dashboard button - only visible after company login */}
              {/* <DashboardButton /> */}
            </CompanyProvider>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );

export default App;
