/**
 * Reusable placeholder for pages that aren't built yet.
 * Each data-entry page (Departments, Teachers, etc.) will
 * replace this in subsequent prompts.
 */
import { Construction } from 'lucide-react'

export default function PlaceholderPage({ title, description }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center space-y-4 max-w-md mx-auto">
      <div className="w-16 h-16 rounded-2xl bg-ground border border-primary/12 flex items-center justify-center">
        <Construction size={28} className="text-secondary" />
      </div>
      <h2 className="text-xl font-semibold text-body">{title}</h2>
      <p className="text-sm text-muted">{description}</p>
      <span className="px-3 py-1 text-xs rounded-full bg-primary/15 text-secondary border border-secondary/30">
        Coming in a later prompt
      </span>
    </div>
  )
}
