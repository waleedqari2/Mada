import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { BarChart3, TrendingDown, Clock, Shield } from "lucide-react";

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  if (isAuthenticated) {
    // Redirect to dashboard if already authenticated
    setLocation("/dashboard");
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-8 h-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-slate-900">
              تتبع أسعار الفنادق
            </h1>
          </div>
          <div className="flex gap-4">
            {user ? (
              <div className="text-sm text-slate-600">
                مرحباً، {user.name || user.email}
              </div>
            ) : null}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h2 className="text-5xl font-bold text-slate-900 mb-6">
            راقب أسعار الفنادق في مكة بذكاء
          </h2>
          <p className="text-xl text-slate-600 mb-8 max-w-2xl mx-auto">
            احصل على أقل الأسعار تلقائياً كل 10 دقائق مع مقارنة شاملة لأفضل الفنادق في مكة المكرمة
          </p>
          <Button
            size="lg"
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg"
            onClick={() => setLocation("/dashboard")}
          >
            ابدأ الآن
          </Button>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-center w-12 h-12 bg-blue-100 rounded-lg mb-4">
              <TrendingDown className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              أقل الأسعار
            </h3>
            <p className="text-slate-600">
              احصل على أقل سعر متاح لكل فندق بشكل تلقائي ومستمر
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-center w-12 h-12 bg-green-100 rounded-lg mb-4">
              <Clock className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              تحديث فوري
            </h3>
            <p className="text-slate-600">
              تحديث البيانات كل 10 دقائق للحصول على أحدث الأسعار
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-center w-12 h-12 bg-purple-100 rounded-lg mb-4">
              <BarChart3 className="w-6 h-6 text-purple-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              مقارنة شاملة
            </h3>
            <p className="text-slate-600">
              قارن الأسعار بين الفنادق المختلفة لفترات زمنية محددة
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-center w-12 h-12 bg-red-100 rounded-lg mb-4">
              <Shield className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              آمان عالي
            </h3>
            <p className="text-slate-600">
              بيانات الاعتماد مشفرة وآمنة بالكامل
            </p>
          </div>
        </div>

        {/* CTA Section */}
        <div className="bg-white rounded-lg shadow-lg p-12 text-center">
          <h3 className="text-3xl font-bold text-slate-900 mb-4">
            جاهز للبدء؟
          </h3>
          <p className="text-lg text-slate-600 mb-8">
            قم بتسجيل الدخول أو إنشاء حساب جديد للوصول إلى لوحة التحكم
          </p>
          <Button
            size="lg"
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg"
            onClick={() => setLocation("/dashboard")}
          >
            الذهاب إلى الداشبورد
          </Button>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-white mt-20 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-slate-400">
            © 2026 تطبيق تتبع أسعار الفنادق. جميع الحقوق محفوظة.
          </p>
        </div>
      </footer>
    </div>
  );
}
