'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

type Tag = {
  name: string
  usage_count: number
}

export default function DataEntryPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const [message, setMessage] = useState('')
  const [isWorking, setIsWorking] = useState(false)
  const [isSessionActive, setIsSessionActive] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [taskTitle, setTaskTitle] = useState('')
  const [taskMessage, setTaskMessage] = useState('')
  const [note, setNote] = useState('')
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [tagTarget, setTagTarget] = useState<'note' | 'title'>('note')
  const [showTags, setShowTags] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
      } else {
        setUser(user)
        checkSession(user)
        fetchTags()
        setLoading(false)
      }
    }
    getUser()
  }, [])

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const checkSession = async (user: User) => {
    const { data, error } = await supabase
      .from('work_logs')
      .select('*')
      .eq('user_id', user.id)
      .is('end_time', null)
      .order('start_time', { ascending: false })
      .limit(1)

    if (!error && data && data.length > 0) {
      setIsSessionActive(true)
    } else {
      setIsSessionActive(false)
    }
  }

  const fetchTags = async () => {
    const { data, error } = await supabase
      .from('tags')
      .select('name, usage_count')
      .order('usage_count', { ascending: false })

    if (!error && data) {
      setAvailableTags(data.map((tag: Tag) => tag.name))
    }
  }

  const extractTagsFromNote = (text: string): string[] => {
    const tagSet = new Set<string>()
    const regex = /#([\p{L}\p{N}_]+)/gu
    let match
    while ((match = regex.exec(text))) {
      tagSet.add(match[1])
    }
    return Array.from(tagSet)
  }

  const insertNewTags = async (tags: string[]) => {
    const newTags = tags.filter(tag => !availableTags.includes(tag))
    if (newTags.length === 0) return

    const insertData = newTags.map(name => ({ name, usage_count: 1 }))
    const { error } = await supabase.from('tags').insert(insertData)
    if (!error) fetchTags()
  }

  const incrementTagUsage = async (tags: string[]) => {
    for (const tag of tags) {
      await supabase.rpc('increment_tag_usage', { tag_name: tag })
    }
  }

  const startWorkday = async () => {
    if (!user) return
    const { error } = await supabase.from('work_logs').insert([
      {
        user_id: user.id,
        project: 'Darba diena',
        start_time: new Date(),
        description: '',
      },
    ])

    if (!error) {
      setMessage('🟢 Darbadiena sākta!')
      await checkSession(user)
    }
  }

  const endWorkday = async () => {
    if (!user) return
    const { data, error } = await supabase
      .from('work_logs')
      .select('*')
      .eq('user_id', user.id)
      .is('end_time', null)
      .order('start_time', { ascending: false })
      .limit(1)

    if (data && data.length > 0) {
      const id = data[0].id
      const { error: updateError } = await supabase
        .from('work_logs')
        .update({ end_time: new Date() })
        .eq('id', id)

      if (!updateError) {
        setMessage('🔴 Darbadiena pabeigta!')
        setIsSessionActive(false)
        setIsWorking(false)
      }
    }
  }

  const startTask = async () => {
    if (!user) return
    const { data: sessions } = await supabase
      .from('work_logs')
      .select('id')
      .eq('user_id', user.id)
      .is('end_time', null)
      .order('start_time', { ascending: false })
      .limit(1)

    if (!sessions || sessions.length === 0) {
      setTaskMessage('⚠️ Nav aktīvas darbadienas.')
      return
    }

    const sessionId = sessions[0].id

    const tagsFromNote = extractTagsFromNote(note)
    const tagsFromTitle = extractTagsFromNote(taskTitle)
    const allTags = Array.from(new Set([...tagsFromNote, ...tagsFromTitle]))

    const finalTitle = taskTitle.trim() || allTags[0] || 'Uzdevums'

    const { data: insertedTasks, error: taskError } = await supabase
      .from('task_logs')
      .insert([
        {
          user_id: user.id,
          session_id: sessionId,
          title: finalTitle,
          start_time: new Date(),
          note,
        },
      ])
      .select('id')

    if (taskError || !insertedTasks || insertedTasks.length === 0) {
      setTaskMessage('❌ Neizdevās sākt uzdevumu.')
      return
    }

    const taskId = insertedTasks[0].id
    await insertNewTags(allTags)
    await incrementTagUsage(allTags)

    setTaskMessage('🟢 Uzdevums sācies!')
    setTaskTitle('')
    setNote('')
  }

  const endTask = async () => {
    if (!user) return
    const { data, error } = await supabase
      .from('task_logs')
      .select('*')
      .eq('user_id', user.id)
      .is('end_time', null)
      .order('start_time', { ascending: false })
      .limit(1)

    if (error || !data || data.length === 0) {
      setTaskMessage('⚠️ Nav aktīva uzdevuma, ko beigt.')
      return
    }

    const task = data[0]
    const { error: updateError } = await supabase
      .from('task_logs')
      .update({ end_time: new Date() })
      .eq('id', task.id)

    if (updateError) {
      console.error('❌ Kļūda pabeidzot uzdevumu:', updateError)
      setTaskMessage('❌ Neizdevās beigt uzdevumu.')
    } else {
      setTaskMessage('🔚 Uzdevums pabeigts!')
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user) return
    const files = e.target.files
    if (!files || files.length === 0) return

    const { data: activeTask } = await supabase
      .from('task_logs')
      .select('id')
      .eq('user_id', user.id)
      .is('end_time', null)
      .order('start_time', { ascending: false })
      .limit(1)
      .single()

    if (!activeTask) {
      alert('Nav aktīva uzdevuma!')
      return
    }

    for (const file of files) {
      const fileExt = file.name.split('.').pop()
      const fileName = `${activeTask.id}_${Date.now()}.${fileExt}`
      const filePath = `${activeTask.id}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('task-images')
        .upload(filePath, file)

      if (uploadError) {
        console.error('Upload error:', uploadError)
        continue
      }

      const { data: publicUrlData } = supabase.storage
        .from('task-images')
        .getPublicUrl(filePath)

      const imageUrl = publicUrlData?.publicUrl

      const { error: insertError } = await supabase
        .from('task_images')
        .insert({ task_id: activeTask.id, image_url: imageUrl, user_id: user.id })

      if (insertError) {
        console.error('Insert error:', insertError)
      }
    }

    alert('✅ Attēli augšupielādēti!')
  }

  const formatDate = (date: Date): string => date.toLocaleDateString('lv-LV', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })
  const formatTime = (date: Date): string => date.toLocaleTimeString('lv-LV')

  if (loading) return <div className="text-center p-10">Loading...</div>

  return <></> // saglabāts tikai koda daļai pārskatīšanai
}
