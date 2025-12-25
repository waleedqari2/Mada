# Quick Setup Guide - WebBeds Price Tracker

## ⚡ Quick Start (5 minutes)

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Setup Environment
```bash
cp .env.example .env
```

Edit `.env` and configure:
- Database URL
- Generate secure keys for `ENCRYPTION_KEY` and `SESSION_SECRET`

### 3. Setup Database
```bash
pnpm run db:push
```

### 4. Start Application
```bash
# Development mode
pnpm run dev

# Production mode
pnpm run build
pnpm start
```

### 5. Access Application
Open browser at: `http://localhost:3000`

---

## 🎯 First Time Usage

### Step 1: Login to WebBeds
1. The app will display the login phase
2. Enter credentials:
   - Username: `Mada.Tourism`
   - Password: `MadaTourism@2020`
3. Click "تسجيل الدخول" (Login)
4. Enter 2FA code when prompted

**Alternative:** Upload a saved session JSON file

### Step 2: Add Hotels
1. After login, you'll see the search phase
2. Enter hotel name in "إضافة فندق جديد"
3. Click the + button
4. Hotel is saved to database

### Step 3: Search for Prices
1. Select one or more hotels from the list
2. Choose check-in and check-out dates
3. Select search mode:
   - **Full Period**: Searches entire date range
   - **Night by Night**: Searches each individual night
4. Click "البحث عن الأسعار" (Search for Prices)

### Step 4: View Results
- Results appear in a table with:
  - Date range
  - Lowest price
  - Availability status
  - Comparison status (winning/losing/equal)
- Export to CSV using the export button

---

## 🔑 WebBeds Authentication

### OAuth Flow
The app uses WebBeds OAuth with this endpoint:
```
https://accounts.webbeds.com/oauth2/authorize?audience=https%3A%2F%2Fwww.dotwconnect.com%2F&client_id=dotw&...
```

### 2FA (Two-Factor Authentication)
After initial login, WebBeds sends a 2FA code to your registered email/app. Enter this code in the app to complete authentication.

### Session Management
- Sessions are saved and encrypted in the `.sessions/` directory
- Sessions remain valid for 15 days
- You can download your session as JSON for backup
- Upload a session file to skip login process

---

## 📊 Understanding Results

### Comparison Status
- 🟢 **رابح (Winning)**: Your price is lower than competitor
- 🔴 **خاسر (Losing)**: Competitor price is lower than yours
- 🟡 **متساوي (Equal)**: Prices are the same
- ⚪ **لا توجد بيانات (No Data)**: No comparison data available

### Price Display
- All prices shown in SAR (Saudi Riyals)
- Prices are extracted directly from WebBeds
- "غير متاح" means the hotel is not available for that date

---

## 🗄️ Database Structure

### Tables Created
- `users` - User accounts
- `hotels` - Saved hotels
- `priceHistory` - Price tracking history
- `webbedCredentials` - Encrypted WebBeds credentials
- `syncLogs` - Search history
- `userPrices` - Your custom prices
- `priceAlerts` - Price drop alerts

---

## 🔧 Troubleshooting

### "Please login" errors
- Make sure you've completed the OAuth login flow
- Check if your session has expired (>15 days)
- Try re-logging in or uploading a fresh session

### Database connection errors
- Verify `DATABASE_URL` in `.env`
- Ensure MySQL is running
- Run `pnpm run db:push` to create tables

### WebBeds scraping issues
- Ensure your WebBeds credentials are valid
- Check if WebBeds website structure has changed
- Try uploading a fresh session file

### Build errors
- Run `pnpm run check` to see TypeScript errors
- Clear cache: `rm -rf node_modules .pnpm-store`
- Reinstall: `pnpm install`

---

## 📚 Additional Resources

- Full Documentation: `SINGLE_PAGE_APP.md`
- Project TODO: `todo.md`
- Package Info: `package.json`

---

## 💡 Tips

1. **Save Your Session**: Download session JSON after first login for quick access
2. **Add Multiple Hotels**: Select multiple hotels to compare prices simultaneously
3. **Export Data**: Use CSV export to analyze prices in Excel/Sheets
4. **Check History**: Review previous searches in the search history section
5. **Monitor Sessions**: Keep track of session expiry (shown in days remaining)

---

## 🆘 Support

For issues or questions:
1. Check `SINGLE_PAGE_APP.md` for detailed documentation
2. Review error messages in browser console
3. Check server logs in terminal
4. Verify environment variables are set correctly

---

**Happy Price Tracking! 🎉**
