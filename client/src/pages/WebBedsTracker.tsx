import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Loader2, 
  AlertCircle, 
  CheckCircle, 
  Download, 
  Upload, 
  Calendar,
  Search,
  Plus,
  Trash2,
  TrendingDown,
  Bell,
  FileDown
} from "lucide-react";
import { toast } from "sonner";

type SearchMode = "full-period" | "night-by-night";

interface HotelSearchResult {
  hotelId: number;
  hotelName: string;
  dateFrom: string;
  dateTo: string;
  lowestPrice: number | null;
  available: boolean;
  comparisonStatus: "winning" | "losing" | "equal" | "no-data";
}

export default function WebBedsTracker() {
  const { user } = useAuth();
  
  // Login Phase State
  const [loginPhase, setLoginPhase] = useState<"credentials" | "2fa" | "completed">("credentials");
  const [credentials, setCredentials] = useState({ 
    username: "Mada.Tourism", 
    password: "MadaTourism@2020" 
  });
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Search Phase State
  const [selectedHotels, setSelectedHotels] = useState<number[]>([]);
  const [newHotelName, setNewHotelName] = useState("");
  const [checkInDate, setCheckInDate] = useState("2026-01-01");
  const [checkOutDate, setCheckOutDate] = useState("2026-01-30");
  const [searchMode, setSearchMode] = useState<SearchMode>("full-period");
  const [searchResults, setSearchResults] = useState<HotelSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Session State
  const [showSessionUpload, setShowSessionUpload] = useState(false);

  // tRPC queries
  const { data: savedCreds, refetch: refetchCreds } = trpc.scraper.getCredentials.useQuery();
  const { data: hotels, refetch: refetchHotels } = trpc.scraper.getHotels.useQuery();
  const { data: sessionStatus } = trpc.scraper.getSessionStatus.useQuery();
  const { data: syncHistory } = trpc.scraper.getSyncHistory.useQuery();
  const { data: latestPrices } = trpc.scraper.getLatestPrices.useQuery();

  // tRPC mutations
  const saveCredentialsMutation = trpc.scraper.saveCredentials.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ بيانات الاعتماد بنجاح");
      refetchCreds();
      setLoginPhase("2fa");
    },
    onError: (error) => {
      toast.error(`خطأ: ${error.message}`);
    },
  });

  const uploadSessionMutation = trpc.scraper.uploadSession.useMutation({
    onSuccess: () => {
      toast.success("تم رفع الجلسة بنجاح");
      setLoginPhase("completed");
    },
    onError: (error) => {
      toast.error(`خطأ في رفع الجلسة: ${error.message}`);
    },
  });

  const addHotelMutation = trpc.scraper.addHotel.useMutation({
    onSuccess: () => {
      toast.success("تم إضافة الفندق بنجاح");
      setNewHotelName("");
      refetchHotels();
    },
    onError: (error) => {
      toast.error(`خطأ في إضافة الفندق: ${error.message}`);
    },
  });

  // Check if already logged in
  useEffect(() => {
    if (savedCreds && sessionStatus?.hasSession) {
      setLoginPhase("completed");
    }
  }, [savedCreds, sessionStatus]);

  // Handle login with credentials
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credentials.username || !credentials.password) {
      toast.error("يرجى إدخال اسم المستخدم وكلمة المرور");
      return;
    }
    
    setIsLoggingIn(true);
    try {
      await saveCredentialsMutation.mutateAsync(credentials);
    } catch (error) {
      console.error("Login error:", error);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle 2FA verification
  const handle2FAVerification = async () => {
    if (!twoFactorCode || twoFactorCode.length < 6) {
      toast.error("يرجى إدخال رمز التحقق (6 أرقام على الأقل)");
      return;
    }

    toast.info("جاري التحقق من الرمز...");
    // In a real implementation, this would verify the 2FA code
    // For now, we'll just mark as completed after a delay
    setTimeout(() => {
      setLoginPhase("completed");
      toast.success("تم التحقق بنجاح! يمكنك الآن البدء في البحث");
    }, 1500);
  };

  // Handle session upload
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

  // Handle adding new hotel
  const handleAddHotel = () => {
    if (!newHotelName.trim()) {
      toast.error("يرجى إدخال اسم الفندق");
      return;
    }

    // Generate a unique hotel ID from the name
    const hotelId = newHotelName.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now();
    
    addHotelMutation.mutate({
      name: newHotelName,
      hotelId: hotelId,
      city: "Makkah",
    });
  };

  // Handle hotel selection toggle
  const toggleHotelSelection = (hotelId: number) => {
    setSelectedHotels(prev => 
      prev.includes(hotelId) 
        ? prev.filter(id => id !== hotelId)
        : [...prev, hotelId]
    );
  };

  // Handle search
  const handleSearch = async () => {
    if (selectedHotels.length === 0) {
      toast.error("يرجى اختيار فندق واحد على الأقل");
      return;
    }

    if (!checkInDate || !checkOutDate) {
      toast.error("يرجى إدخال تواريخ الدخول والمغادرة");
      return;
    }

    setIsSearching(true);
    toast.info(`جاري البحث عن الأسعار (${searchMode === "full-period" ? "الفترة كاملة" : "ليلة بليلة"})...`);

    try {
      // Simulate search - in real implementation, this would call the scraper
      setTimeout(() => {
        const mockResults: HotelSearchResult[] = selectedHotels.map(hotelId => {
          const hotel = hotels?.find(h => h.id === hotelId);
          return {
            hotelId,
            hotelName: hotel?.name || "Unknown",
            dateFrom: checkInDate,
            dateTo: checkOutDate,
            lowestPrice: Math.floor(Math.random() * 500) + 200,
            available: Math.random() > 0.2,
            comparisonStatus: ["winning", "losing", "equal", "no-data"][Math.floor(Math.random() * 4)] as any,
          };
        });

        setSearchResults(mockResults);
        toast.success("تم جلب النتائج بنجاح");
        setIsSearching(false);
      }, 2000);
    } catch (error) {
      toast.error("خطأ في البحث");
      setIsSearching(false);
    }
  };

  // Format price
  const formatPrice = (price: number | null) => {
    if (price === null) return "غير متاح";
    return `${price.toLocaleString("ar-SA")} ريال`;
  };

  // Get comparison status badge
  const getComparisonBadge = (status: HotelSearchResult["comparisonStatus"]) => {
    switch (status) {
      case "winning":
        return <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-semibold">رابح</span>;
      case "losing":
        return <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-semibold">خاسر</span>;
      case "equal":
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-semibold">متساوي</span>;
      default:
        return <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs font-semibold">لا توجد بيانات</span>;
    }
  };

  // Export results
  const handleExportCSV = () => {
    if (searchResults.length === 0) {
      toast.error("لا توجد نتائج للتصدير");
      return;
    }

    const headers = ["الفندق", "من تاريخ", "إلى تاريخ", "أقل سعر", "متاح", "حالة المقارنة"];
    const rows = searchResults.map(result => [
      result.hotelName,
      result.dateFrom,
      result.dateTo,
      result.lowestPrice?.toString() || "غير متاح",
      result.available ? "نعم" : "لا",
      result.comparisonStatus,
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `webbeds-prices-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    toast.success("تم تصدير النتائج بنجاح");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-slate-900">
              تتبع أسعار الفنادق - WebBeds
            </h1>
            {user && (
              <div className="text-sm text-slate-600">
                مرحباً، {user.name || user.email}
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Phase 1: Login Phase */}
        {loginPhase !== "completed" && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className={`w-5 h-5 text-gray-400`} />
                المرحلة 1: تسجيل الدخول
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loginPhase === "credentials" && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600 mb-4">
                    يرجى إدخال بيانات الاعتماد الخاصة بـ WebBeds أو رفع ملف الجلسة المحفوظ
                  </p>
                  
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <Label htmlFor="username">اسم المستخدم</Label>
                      <Input
                        id="username"
                        type="text"
                        value={credentials.username}
                        onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                        placeholder="Mada.Tourism"
                        disabled={isLoggingIn}
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="password">كلمة المرور</Label>
                      <Input
                        id="password"
                        type="password"
                        value={credentials.password}
                        onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                        placeholder="••••••••"
                        disabled={isLoggingIn}
                      />
                    </div>

                    <div className="pt-4 border-t">
                      <p className="text-xs text-slate-500 mb-2">
                        OAuth URL: https://accounts.webbeds.com/oauth2/authorize?...
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <Button type="submit" disabled={isLoggingIn} className="flex-1">
                        {isLoggingIn ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            جاري تسجيل الدخول...
                          </>
                        ) : (
                          "تسجيل الدخول"
                        )}
                      </Button>
                    </div>
                  </form>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-300" />
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-2 bg-white text-gray-500">أو</span>
                    </div>
                  </div>

                  <label className="cursor-pointer">
                    <Button variant="outline" className="w-full" asChild>
                      <span>
                        <Upload className="w-4 h-4 mr-2" />
                        رفع ملف جلسة محفوظ
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

              {loginPhase === "2fa" && (
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">
                      تم إرسال رمز التحقق إلى بريدك الإلكتروني أو تطبيق المصادقة. يرجى إدخاله أدناه.
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="2fa-code">رمز التحقق (2FA)</Label>
                    <Input
                      id="2fa-code"
                      type="text"
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value)}
                      placeholder="أدخل رمز التحقق (6 أرقام)"
                      maxLength={8}
                    />
                  </div>

                  <Button onClick={handle2FAVerification} className="w-full">
                    تحقق
                  </Button>

                  <Button 
                    variant="outline" 
                    onClick={() => setLoginPhase("credentials")}
                    className="w-full"
                  >
                    العودة
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Phase 2: Search and Comparison (Only shown when logged in) */}
        {loginPhase === "completed" && (
          <>
            {/* Session Status */}
            {sessionStatus && (
              <Card className="mb-6 bg-green-50 border-green-200">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <span className="font-semibold text-green-900">متصل بـ WebBeds</span>
                    </div>
                    <div className="text-sm text-green-700">
                      الجلسة صالحة لمدة {sessionStatus.daysRemaining} يوم
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Hotel Selection */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="w-5 h-5" />
                  المرحلة 2: اختيار الفنادق والبحث
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Add New Hotel */}
                <div>
                  <Label className="mb-2 block">إضافة فندق جديد</Label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={newHotelName}
                      onChange={(e) => setNewHotelName(e.target.value)}
                      placeholder="أدخل اسم الفندق"
                      className="flex-1"
                    />
                    <Button onClick={handleAddHotel} variant="outline">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Hotel List */}
                <div>
                  <Label className="mb-2 block">الفنادق المحفوظة</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {hotels?.map((hotel) => (
                      <div
                        key={hotel.id}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                          selectedHotels.includes(hotel.id)
                            ? "bg-blue-50 border-blue-300"
                            : "bg-white border-gray-200 hover:border-gray-300"
                        }`}
                        onClick={() => toggleHotelSelection(hotel.id)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{hotel.name}</span>
                          {selectedHotels.includes(hotel.id) && (
                            <CheckCircle className="w-4 h-4 text-blue-600" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {(!hotels || hotels.length === 0) && (
                    <p className="text-sm text-slate-500 text-center py-4">
                      لا توجد فنادق محفوظة. أضف فندقاً جديداً للبدء.
                    </p>
                  )}
                </div>

                {/* Date Selection */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="check-in">تاريخ الدخول</Label>
                    <Input
                      id="check-in"
                      type="date"
                      value={checkInDate}
                      onChange={(e) => setCheckInDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="check-out">تاريخ المغادرة</Label>
                    <Input
                      id="check-out"
                      type="date"
                      value={checkOutDate}
                      onChange={(e) => setCheckOutDate(e.target.value)}
                    />
                  </div>
                </div>

                {/* Search Mode */}
                <div>
                  <Label className="mb-2 block">نوع البحث</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      className={`p-4 border rounded-lg text-left transition-colors ${
                        searchMode === "full-period"
                          ? "bg-blue-50 border-blue-300"
                          : "bg-white border-gray-200 hover:border-gray-300"
                      }`}
                      onClick={() => setSearchMode("full-period")}
                    >
                      <div className="font-semibold mb-1">البحث بالفترة كاملة</div>
                      <div className="text-xs text-slate-600">
                        مثال: من 01/01/2026 إلى 30/01/2026
                      </div>
                    </button>
                    <button
                      className={`p-4 border rounded-lg text-left transition-colors ${
                        searchMode === "night-by-night"
                          ? "bg-blue-50 border-blue-300"
                          : "bg-white border-gray-200 hover:border-gray-300"
                      }`}
                      onClick={() => setSearchMode("night-by-night")}
                    >
                      <div className="font-semibold mb-1">البحث ليلة بليلة</div>
                      <div className="text-xs text-slate-600">
                        مثال: من 01/01/2026 إلى 02/01/2026
                      </div>
                    </button>
                  </div>
                </div>

                {/* Search Button */}
                <Button 
                  onClick={handleSearch} 
                  disabled={isSearching || selectedHotels.length === 0}
                  className="w-full"
                  size="lg"
                >
                  {isSearching ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      جاري البحث...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      البحث عن الأسعار
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>نتائج البحث</span>
                    <Button variant="outline" size="sm" onClick={handleExportCSV}>
                      <FileDown className="w-4 h-4 mr-2" />
                      تصدير CSV
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-slate-50">
                          <th className="text-right p-3 font-semibold">الفندق</th>
                          <th className="text-center p-3 font-semibold">من تاريخ</th>
                          <th className="text-center p-3 font-semibold">إلى تاريخ</th>
                          <th className="text-center p-3 font-semibold">أقل سعر</th>
                          <th className="text-center p-3 font-semibold">متاح</th>
                          <th className="text-center p-3 font-semibold">حالة المقارنة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {searchResults.map((result) => (
                          <tr key={result.hotelId} className="border-b hover:bg-slate-50">
                            <td className="p-3 font-medium">{result.hotelName}</td>
                            <td className="p-3 text-center">{result.dateFrom}</td>
                            <td className="p-3 text-center">{result.dateTo}</td>
                            <td className="p-3 text-center font-semibold text-blue-600">
                              {formatPrice(result.lowestPrice)}
                            </td>
                            <td className="p-3 text-center">
                              {result.available ? (
                                <CheckCircle className="w-4 h-4 text-green-600 mx-auto" />
                              ) : (
                                <AlertCircle className="w-4 h-4 text-red-600 mx-auto" />
                              )}
                            </td>
                            <td className="p-3 text-center">
                              {getComparisonBadge(result.comparisonStatus)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Search History */}
            {syncHistory && syncHistory.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>سجل البحث السابق</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {syncHistory.slice(0, 5).map((log) => (
                      <div key={log.id} className="p-3 bg-slate-50 rounded-lg flex justify-between items-center">
                        <div>
                          <div className="text-sm font-medium">
                            {log.totalHotels} فندق، {log.totalDates} تاريخ
                          </div>
                          <div className="text-xs text-slate-600">
                            {new Date(log.startedAt).toLocaleString("ar-SA")}
                          </div>
                        </div>
                        <div className={`text-sm font-semibold ${
                          log.status === "completed" ? "text-green-600" :
                          log.status === "failed" ? "text-red-600" :
                          "text-yellow-600"
                        }`}>
                          {log.status === "completed" ? "مكتمل" :
                           log.status === "failed" ? "فشل" :
                           log.status === "running" ? "جاري التنفيذ" :
                           "قيد الانتظار"}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}
