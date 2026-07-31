/**
 * Reusable placeholder for pages that aren't built yet.
 * Each data-entry page (Departments, Teachers, etc.) will
 * replace this in subsequent prompts.
 */
import { Construction } from 'lucide-react'

export default function PlaceholderPage({ title, description }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center space-y-4 max-w-md mx-auto">
      <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
        <Construction size={28} className="text-brand-400" />
      </div>
      <h2 className="text-xl font-semibold text-gray-200">{title}</h2>
      <p className="text-sm text-gray-500">{description}</p>
      <span className="px-3 py-1 text-xs rounded-full bg-brand-600/20 text-brand-300 border border-brand-500/30">
        Coming in a later prompt
      </span>
    </div>
  )
}
