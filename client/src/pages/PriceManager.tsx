import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  CheckCircle,
  TrendingDown,
  TrendingUp,
  Bell,
  X,
} from "lucide-react";
import { toast } from "sonner";

export default function PriceManager() {
  const { data: hotels } = trpc.scraper.getHotels.useQuery();
  const { data: latestPrices } = trpc.scraper.getLatestPrices.useQuery();
  const { data: activeAlerts } = trpc.pricing.getActiveAlerts.useQuery();

  const [selectedHotel, setSelectedHotel] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState("2026-02-16");
  const [userPrice, setUserPrice] = useState("");
  const [competitorPrice, setCompetitorPrice] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Mutations
  const saveUserPriceMutation = trpc.pricing.saveUserPrice.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ السعر بنجاح");
      setUserPrice("");
    },
    onError: (error) => {
      toast.error(`خطأ: ${error.message}`);
    },
  });

  const dismissAlertMutation = trpc.pricing.dismissAlert.useMutation({
    onSuccess: () => {
      toast.success("تم إغلاق التنبيه");
    },
    onError: (error) => {
      toast.error(`خطأ: ${error.message}`);
    },
  });

  // Get competitor price when hotel/date changes
  useEffect(() => {
    if (selectedHotel && selectedDate && latestPrices) {
      const price = latestPrices.find(
        (p) => p.hotelId === selectedHotel && p.date === selectedDate
      );
      setCompetitorPrice(price?.actualPrice || null);
    }
  }, [selectedHotel, selectedDate, latestPrices]);

  const handleSavePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHotel || !userPrice) {
      toast.error("يرجى ملء جميع الحقول");
      return;
    }

    const price = parseFloat(userPrice);
    if (isNaN(price) || price <= 0) {
      toast.error("يرجى إدخال سعر صحيح");
      return;
    }

    saveUserPriceMutation.mutate({
      hotelId: selectedHotel,
      date: selectedDate,
      customPrice: Math.round(price * 100),
    });
  };

  const calculateDifference = () => {
    if (!userPrice || !competitorPrice) return null;
    const userPriceNum = parseFloat(userPrice);
    return competitorPrice - userPriceNum;
  };

  const difference = calculateDifference();
  const isLosingPrice = difference !== null && difference < 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            مدير الأسعار
          </h1>
          <p className="text-slate-600">
            إدارة أسعارك ومقارنتها مع أسعار المنافسين
          </p>
        </div>

        {/* Active Alerts */}
        {activeAlerts && activeAlerts.length > 0 && (
          <Card className="mb-6 bg-red-50 border-red-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-900">
                <Bell className="w-5 h-5" />
                تنبيهات الأسعار النشطة ({activeAlerts.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {activeAlerts.map((alert: any) => (
                  <div
                    key={alert.id}
                    className="p-4 bg-white border border-red-200 rounded-lg flex justify-between items-start"
                  >
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900">
                        {alert.hotelName}
                      </p>
                      <p className="text-sm text-slate-600">
                        التاريخ: {alert.date}
                      </p>
                      <div className="mt-2 grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-slate-600">سعرك</p>
                          <p className="font-bold text-blue-600">
                            {(alert.userPrice / 100).toFixed(2)} ريال
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-600">سعر المنافس</p>
                          <p className="font-bold text-red-600">
                            {(alert.competitorPrice / 100).toFixed(2)} ريال
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-600">الفرق</p>
                          <p className="font-bold text-red-600">
                            -{(Math.abs(alert.priceDifference) / 100).toFixed(2)} ريال
                          </p>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => dismissAlertMutation.mutate({ alertId: alert.id })}
                      className="ml-4"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Price Input Form */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>إدخال السعر الخاص بك</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSavePrice} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="hotel-select">الفندق</Label>
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
                  <Label htmlFor="date-input">التاريخ</Label>
                  <Input
                    id="date-input"
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="user-price">سعرك (بدون النسبة)</Label>
                  <Input
                    id="user-price"
                    type="number"
                    step="0.01"
                    placeholder="مثال: 197.00"
                    value={userPrice}
                    onChange={(e) => setUserPrice(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="competitor-price">سعر المنافس</Label>
                  <Input
                    id="competitor-price"
                    type="text"
                    disabled
                    value={
                      competitorPrice
                        ? `${(competitorPrice / 100).toFixed(2)} ريال`
                        : "غير متاح"
                    }
                    className="bg-slate-100"
                  />
                </div>
              </div>

              {/* Price Comparison */}
              {userPrice && competitorPrice && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-slate-600">سعرك</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {parseFloat(userPrice).toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-600">سعر المنافس</p>
                      <p className="text-2xl font-bold text-slate-900">
                        {(competitorPrice / 100).toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-600">الفرق</p>
                      <div
                        className={`text-2xl font-bold flex items-center gap-2 ${
                          isLosingPrice ? "text-red-600" : "text-green-600"
                        }`}
                      >
                        {isLosingPrice ? (
                          <>
                            <TrendingDown className="w-5 h-5" />
                            -{Math.abs(difference!).toFixed(2)}
                          </>
                        ) : (
                          <>
                            <TrendingUp className="w-5 h-5" />
                            +{difference!.toFixed(2)}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {isLosingPrice && (
                    <div className="mt-4 p-3 bg-red-100 border border-red-300 rounded flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-red-800">
                        ⚠️ سعرك أعلى من سعر المنافس بمقدار{" "}
                        <strong>{Math.abs(difference!).toFixed(2)} ريال</strong>
                        . قد تحتاج إلى تخفيض السعر للبقاء منافساً.
                      </p>
                    </div>
                  )}
                </div>
              )}

              <Button
                type="submit"
                disabled={saveUserPriceMutation.isPending || !selectedHotel || !userPrice}
                className="w-full"
              >
                {saveUserPriceMutation.isPending ? "جاري الحفظ..." : "حفظ السعر"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Price Status Legend */}
        <Card>
          <CardHeader>
            <CardTitle>شرح الحالات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <p className="font-semibold text-green-900">رابح</p>
                </div>
                <p className="text-sm text-green-800">
                  سعرك أقل من سعر المنافس - أنت في موضع قوي
                </p>
              </div>

              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600" />
                  <p className="font-semibold text-yellow-900">متساوي</p>
                </div>
                <p className="text-sm text-yellow-800">
                  سعرك مساوي لسعر المنافس - تنافس مباشر
                </p>
              </div>

              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="w-5 h-5 text-red-600" />
                  <p className="font-semibold text-red-900">خاسر</p>
                </div>
                <p className="text-sm text-red-800">
                  سعرك أعلى من سعر المنافس - قد تفقد العملاء
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
