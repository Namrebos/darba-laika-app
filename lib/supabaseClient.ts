import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://hsohjtcuqlxmthvpkvlc.supabase.co'         // ← maini uz savu
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhzb2hqdGN1cWx4bXRodnBrdmxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyMjI0ODMsImV4cCI6MjA2Njc5ODQ4M30.J7AS-yWr-jvfUvZKQ1lpMPEWazll_zPrDYdMlwEoh0g'                 // ← maini uz savu

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
