#!/bin/bash

# Urganize Auth Store Diagnostic Script
# Run this to check what's wrong with your auth store

echo "🔍 URGANIZE AUTH STORE DIAGNOSTIC"
echo "=================================="
echo ""

# Check if auth-store.ts exists
echo "1. Checking if lib/auth-store.ts exists..."
if [ -f "lib/auth-store.ts" ]; then
    echo "   ✅ lib/auth-store.ts exists"
else
    echo "   ❌ lib/auth-store.ts NOT FOUND"
    exit 1
fi
echo ""

# Check if it imports from supabase
echo "2. Checking if auth-store imports from Supabase..."
if grep -q "from './supabase/client'" lib/auth-store.ts; then
    echo "   ✅ Imports Supabase client"
else
    echo "   ❌ Does NOT import Supabase client (using old version)"
    echo "   📝 You need to replace this file!"
    exit 1
fi
echo ""

# Check if checkAuth exists
echo "3. Checking if checkAuth function exists..."
if grep -q "checkAuth:" lib/auth-store.ts; then
    echo "   ✅ checkAuth function found"
else
    echo "   ❌ checkAuth function NOT FOUND"
    echo "   📝 You need to replace this file!"
    exit 1
fi
echo ""

# Check if supabase client exists
echo "4. Checking if lib/supabase/client.ts exists..."
if [ -f "lib/supabase/client.ts" ]; then
    echo "   ✅ lib/supabase/client.ts exists"
else
    echo "   ❌ lib/supabase/client.ts NOT FOUND"
    echo "   📝 You need to create this file first!"
    exit 1
fi
echo ""

# Check if .env.local exists
echo "5. Checking if .env.local exists..."
if [ -f ".env.local" ]; then
    echo "   ✅ .env.local exists"
    
    # Check if it has Supabase vars
    if grep -q "NEXT_PUBLIC_SUPABASE_URL" .env.local; then
        echo "   ✅ Has NEXT_PUBLIC_SUPABASE_URL"
    else
        echo "   ❌ Missing NEXT_PUBLIC_SUPABASE_URL"
    fi
    
    if grep -q "NEXT_PUBLIC_SUPABASE_ANON_KEY" .env.local; then
        echo "   ✅ Has NEXT_PUBLIC_SUPABASE_ANON_KEY"
    else
        echo "   ❌ Missing NEXT_PUBLIC_SUPABASE_ANON_KEY"
    fi
else
    echo "   ❌ .env.local NOT FOUND"
    echo "   📝 You need to create this file with Supabase credentials!"
fi
echo ""

# Show first 5 lines of auth-store to verify
echo "6. First 5 lines of lib/auth-store.ts:"
echo "-----------------------------------"
head -5 lib/auth-store.ts
echo "-----------------------------------"
echo ""

# Check if @supabase packages are installed
echo "7. Checking if Supabase packages are installed..."
if [ -d "node_modules/@supabase" ]; then
    echo "   ✅ @supabase packages installed"
else
    echo "   ❌ @supabase packages NOT installed"
    echo "   📝 Run: npm install @supabase/supabase-js @supabase/auth-helpers-nextjs"
fi
echo ""

echo "=================================="
echo "🏁 DIAGNOSTIC COMPLETE"
echo ""
echo "Next steps:"
echo "1. Fix any ❌ errors above"
echo "2. Restart dev server: npm run dev"
echo "3. Try again!"
