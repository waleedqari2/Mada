import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle, CheckCircle, Download, Upload, Activity } from "lucide-react";
import { toast } from "sonner";

interface PriceData {
  [hotelId: number]: {
    [date: string]: {
      displayPrice: number | null;
      actualPrice: number | null;
      available: boolean;
    };
  };
}

export default function Dashboard() {
  const { user } = useAuth();
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [verificationCode, setVerificationCode] = useState("");
  const [showCredentialsForm, setShowCredentialsForm] = useState(false);
  const [showVerificationForm, setShowVerificationForm] = useState(false);
  const [selectedHotel, setSelectedHotel] = useState<number | null>(null);
  const [startDate, setStartDate] = useState("2026-02-16");
  const [endDate, setEndDate] = useState("2026-03-07");
  const [isLoading, setIsLoading] = useState(false);
  const [showComparison, setShowComparison] = useState(false);

  // tRPC queries
  const { data: savedCreds } = trpc.scraper.getCredentials.useQuery();
  const { data: hotels } = trpc.scraper.getHotels.useQuery();
  const { data: latestPrices } = trpc.scraper.getLatestPrices.useQuery();
  const { data: syncStatus } = trpc.scraper.getSyncStatus.useQuery();
  const { data: sessionStatus } = trpc.scraper.getSessionStatus.useQuery();
  const { data: syncMonitorStats } = trpc.scraper.getSyncMonitorStats.useQuery();

  // tRPC mutations
  const saveCredentialsMutation = trpc.scraper.saveCredentials.useMutation({
    onSuccess: () => {
      toast.success("بيانات الاعتماد تم حفظها بنجاح");
      setShowCredentialsForm(false);
      setCredentials({ username: "", password: "" });
    },
    onError: (error) => {
      toast.error(`خطأ: ${error.message}`);
    },
  });

  const deleteCredentialsMutation = trpc.scraper.deleteCredentials.useMutation({
    onSuccess: () => {
      toast.success("تم حذف بيانات الاعتماد");
    },
    onError: (error) => {
      toast.error(`خطأ: ${error.message}`);
    },
  });

  const uploadSessionMutation = trpc.scraper.uploadSession.useMutation({
    onSuccess: () => {
      toast.success("تم رفع الجلسة بنجاح");
    },
    onError: (error) => {
      toast.error(`خطأ في رفع الجلسة: ${error.message}`);
    },
  });

  const { data: sessionExportData, refetch: refetchSessionExport } = trpc.scraper.exportSession.useQuery(
    undefined,
    { enabled: false }
  );

  const handleExportSession = async () => {
    try {
      const data = await refetchSessionExport();
      if (data.data?.sessionJson) {
        const element = document.createElement("a");
        element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(data.data.sessionJson));
        element.setAttribute("download", "webbeds-session.json");
        element.style.display = "none";
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
        toast.success("تم تحميل الجلسة بنجاح");
      }
    } catch (error) {
      toast.error("خطأ في تحميل الجلسة");
    }
  };

  // Handle credentials form submission
  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credentials.username || !credentials.password) {
      toast.error("يرجى إدخال اسم المستخدم وكلمة المرور");
      return;
    }
    saveCredentialsMutation.mutate(credentials);
  };

  // Handle session file upload
  const handleSessionUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const jsonData = event.target?.result as string;
        uploadSessionMutation.mutate({ sessionJson: jsonData });
      } catch (error) {
        toast.error("خطأ في قراءة الملف");
      }
    };
    reader.readAsText(file);
  };

  // Handle price comparison
  const handlePriceComparison = async () => {
    if (!selectedHotel) {
      toast.error("يرجى اختيار فندق");
      return;
    }
    setShowComparison(true);
    toast.success("تم جلب بيانات المقارنة");
  };

  // Format price for display
  const formatPrice = (price: number | null) => {
    if (price === null) return "غير متاح";
    return `${price.toLocaleString("ar-SA")} ريال`;
  };

  // Group prices by date
  const pricesByDate: { [date: string]: { [hotelId: number]: any } } = {};
  if (latestPrices) {
    for (const price of latestPrices) {
      if (!pricesByDate[price.date]) {
        pricesByDate[price.date] = {};
      }
      pricesByDate[price.date][price.hotelId] = price;
    }
  }

  const sortedDates = Object.keys(pricesByDate).sort();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            لوحة تتبع أسعار الفنادق
          </h1>
          <p className="text-slate-600">
            تتبع أسعار الفنادق في مكة بشكل تلقائي ومستمر
          </p>
        </div>

        {/* Session Status Section */}
        {sessionStatus && (
          <Card className="mb-6 bg-blue-50 border-blue-200">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-blue-900">
                <span>حالة الجلسة</span>
                {sessionStatus.needsVerification ? (
                  <AlertCircle className="w-5 h-5 text-orange-500" />
                ) : (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-slate-600">حالة الجلسة</p>
                  <p className="text-lg font-semibold text-blue-900">
                    {sessionStatus.hasSession ? "نشطة" : "غير نشطة"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">الأيام المتبقية</p>
                  <p className="text-lg font-semibold text-blue-900">
                    {sessionStatus.daysRemaining} أيام
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">التحقق المطلوب</p>
                  <p className="text-lg font-semibold text-blue-900">
                    {sessionStatus.needsVerification ? "نعم" : "لا"}
                  </p>
                </div>
              </div>
              {sessionStatus.hasSession && (
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportSession}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    تحميل الجلسة
                  </Button>
                  <label className="cursor-pointer">
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                    >
                      <span>
                        <Upload className="w-4 h-4 mr-2" />
                        رفع جلسة
                      </span>
                    </Button>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleSessionUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Credentials Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>بيانات الاعتماد</span>
              {savedCreds && (
                <CheckCircle className="w-5 h-5 text-green-500" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!showCredentialsForm && savedCreds ? (
              <div className="space-y-4">
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-800">
                    تم حفظ بيانات الاعتماد بنجاح
                  </p>
                  <p className="text-sm text-green-700 mt-1">
                    اسم المستخدم: {savedCreds.username}
                  </p>
                  {savedCreds.lastSyncAt && (
                    <p className="text-xs text-green-600 mt-2">
                      آخر مزامنة: {new Date(savedCreds.lastSyncAt).toLocaleString("ar-SA")}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowCredentialsForm(true)}
                  >
                    تحديث البيانات
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => deleteCredentialsMutation.mutate()}
                  >
                    حذف البيانات
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSaveCredentials} className="space-y-4">
                <div>
                  <Label htmlFor="username">اسم المستخدم</Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="أدخل اسم المستخدم"
                    value={credentials.username}
                    onChange={(e) =>
                      setCredentials({
                        ...credentials,
                        username: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="password">كلمة المرور</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="أدخل كلمة المرور"
                    value={credentials.password}
                    onChange={(e) =>
                      setCredentials({
                        ...credentials,
                        password: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    disabled={saveCredentialsMutation.isPending}
                  >
                    {saveCredentialsMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        جاري الحفظ...
                      </>
                    ) : (
                      "حفظ البيانات"
                    )}
                  </Button>
                  {showCredentialsForm && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowCredentialsForm(false)}
                    >
                      إلغاء
                    </Button>
                  )}
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Verification Code Section */}
        {sessionStatus?.needsVerification && (
          <Card className="mb-6 bg-orange-50 border-orange-200">
            <CardHeader>
              <CardTitle className="text-orange-900">
                رمز التحقق المطلوب
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-orange-800 mb-4">
                انتهت صلاحية الجلسة. يرجى إدخال رمز التحقق الجديد من WebBeds.
              </p>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="verification-code">رمز التحقق</Label>
                  <Input
                    id="verification-code"
                    type="text"
                    placeholder="أدخل رمز التحقق"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                  />
                </div>
                <Button className="w-full">تحقق</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Sync Monitor Section */}
        {syncMonitorStats && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                مراقب المزامنة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-slate-600">إجمالي الدورات</p>
                  <p className="text-2xl font-bold text-blue-900">
                    {syncMonitorStats.totalCycles}
                  </p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-slate-600">الناجحة</p>
                  <p className="text-2xl font-bold text-green-900">
                    {syncMonitorStats.successfulCycles}
                  </p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg">
                  <p className="text-sm text-slate-600">الفاشلة</p>
                  <p className="text-2xl font-bold text-red-900">
                    {syncMonitorStats.failedCycles}
                  </p>
                </div>
                <div className="p-4 bg-purple-50 rounded-lg">
                  <p className="text-sm text-slate-600">معدل النجاح</p>
                  <p className="text-2xl font-bold text-purple-900">
                    {syncMonitorStats.successRate}
                  </p>
                </div>
                <div className="p-4 bg-indigo-50 rounded-lg">
                  <p className="text-sm text-slate-600">وقت التشغيل</p>
                  <p className="text-lg font-bold text-indigo-900">
                    {syncMonitorStats.uptime}
                  </p>
                </div>
                <div className="p-4 bg-yellow-50 rounded-lg">
                  <p className="text-sm text-slate-600">آخر تحديث</p>
                  <p className="text-sm font-semibold text-yellow-900">
                    {syncMonitorStats.lastSyncTime || "لم يتم"}
                  </p>
                </div>
                <div className="p-4 bg-cyan-50 rounded-lg">
                  <p className="text-sm text-slate-600">مدة الدورة</p>
                  <p className="text-lg font-bold text-cyan-900">
                    {syncMonitorStats.averageCycleDuration}
                  </p>
                </div>
                <div className="p-4 bg-pink-50 rounded-lg">
                  <p className="text-sm text-slate-600">العناصر المعالجة</p>
                  <p className="text-2xl font-bold text-pink-900">
                    {syncMonitorStats.totalItemsProcessed}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Price Comparison Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>مقارنة الأسعار</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="hotel-select">اختر الفندق</Label>
                  <select
                    id="hotel-select"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md"
                    value={selectedHotel || ""}
                    onChange={(e) =>
                      setSelectedHotel(
                        e.target.value ? parseInt(e.target.value) : null
                      )
                    }
                  >
                    <option value="">-- اختر فندق --</option>
                    {hotels?.map((hotel) => (
                      <option key={hotel.id} value={hotel.id}>
                        {hotel.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="start-date">من تاريخ</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="end-date">إلى تاريخ</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
              <Button
                onClick={handlePriceComparison}
                disabled={isLoading || !selectedHotel}
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    جاري البحث...
                  </>
                ) : (
                  "عرض المقارنة"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Price Table Section */}
        {latestPrices && latestPrices.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>جدول الأسعار الحالية</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-right p-3 font-semibold">الفندق</th>
                      {sortedDates.slice(0, 7).map((date) => (
                        <th key={date} className="text-center p-3 font-semibold">
                          {new Date(date).toLocaleDateString("ar-SA", {
                            month: "short",
                            day: "numeric",
                          })}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {hotels?.map((hotel) => (
                      <tr key={hotel.id} className="border-b hover:bg-slate-50">
                        <td className="p-3 font-medium">{hotel.name}</td>
                        {sortedDates.slice(0, 7).map((date) => {
                          const price = pricesByDate[date]?.[hotel.id];
                          return (
                            <td key={`${hotel.id}-${date}`} className="p-3 text-center">
                              {price ? (
                                <div>
                                  <p className="font-semibold text-blue-600">
                                    {formatPrice(price.actualPrice)}
                                  </p>
                                  {!price.available && (
                                    <p className="text-xs text-red-500">غير متاح</p>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {(!latestPrices || latestPrices.length === 0) && (
          <Card>
            <CardContent className="p-12 text-center">
              <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600 mb-4">
                لا توجد بيانات أسعار حالياً. يرجى حفظ بيانات الاعتماد والانتظار لأول مزامنة.
              </p>
              <Button
                onClick={() => setShowCredentialsForm(true)}
                disabled={!!savedCreds}
              >
                حفظ بيانات الاعتماد
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
