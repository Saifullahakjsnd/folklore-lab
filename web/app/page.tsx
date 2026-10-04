import {redirect} from 'next/navigation'

// The journal is the first screen.
export default function Home() {
  redirect('/journal')
}
