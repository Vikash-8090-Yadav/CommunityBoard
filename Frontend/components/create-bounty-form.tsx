"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import { CalendarIcon, Loader2, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { useWallet } from "@/context/wallet-context"
import { ethers } from "ethers"
import { communityAddress } from "@/config"
import abi from "@/abi/CommunityBountyBoard.json"
import { TransactionProgress } from "@/components/ui/transaction-progress"
import BountyAISuggestions from './bounty-ai-suggestions'

interface AISuggestions {
  improvedDescription: string;
  improvedRequirements: string[];
  suggestedReward: {
    amount: number;
  };
  suggestedDeadline: {
    date: string;
  };
}

export default function CreateBountyForm() {
  const router = useRouter()
  const { connected, provider } = useWallet()

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [requirements, setRequirements] = useState("")
  const [reward, setReward] = useState("")
  const [date, setDate] = useState<Date>()
  const [time, setTime] = useState("23:59") // Default to end of day
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>("")
  const [transactionStage, setTransactionStage] = useState<"submitted" | "pending" | "confirmed" | "error">("submitted")
  const [transactionError, setTransactionError] = useState<string | null>(null)
  const [showAISuggestions, setShowAISuggestions] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!connected) {
      setTransactionStage("error")
      setTransactionError("Please connect your wallet first")
      return
    }

    if (!title || !description || !requirements || !reward || !date) {
      setTransactionStage("error")
      setTransactionError("Please fill in all required fields")
      return
    }

    try {
      setLoading(true)
      setError("")
      setTransactionStage("submitted")
      setTransactionError(null)

      if (!provider) {
        throw new Error("Provider is not available")
      }

      const signer = provider.getSigner()

      // Convert reward to wei
      const rewardInWei = ethers.utils.parseEther(reward)
      
      // Create a new Date object with the selected date and time
      const [hours, minutes] = time.split(':').map(Number)
      const deadlineDate = new Date(date)
      deadlineDate.setHours(hours, minutes, 0, 0)
      
      // Calculate deadline timestamp in seconds
      const deadline = Math.floor(deadlineDate.getTime() / 1000)

      // Get current nonce
      const nonce = await provider.getTransactionCount(await signer.getAddress())

      // Create the transaction data
      const iface = new ethers.utils.Interface(abi.abi)
      const encodedData = iface.encodeFunctionData("createBounty", [
        title,
        description,
        requirements,
        rewardInWei,
        deadline
      ])

      // Create transaction object
      const tx = {
        from: await signer.getAddress(),
        to: communityAddress,
        data: encodedData,
        value: rewardInWei,
        nonce: nonce
      }

      // Send transaction
      const txResponse = await signer.sendTransaction(tx)

      setTransactionStage("pending")

      // Wait for transaction to be mined
      const receipt = await txResponse.wait()
      console.log("Transaction confirmed:", receipt)
      setTransactionStage("confirmed")

      // Wait for a moment to show the completed state
      await new Promise(resolve => setTimeout(resolve, 1500))

      // Redirect to home page after successful creation
      router.push("/")

    } catch (err: unknown) {
      console.error("Error creating bounty:", err)
      setTransactionStage("error")
      
      // Handle specific error cases
      if (err instanceof Error) {
        if (err.message.includes("4001")) {
          setTransactionError("Transaction was rejected in your wallet")
        } else if (err.message.includes("insufficient funds")) {
          setTransactionError("You don't have enough ETH to create this bounty")
        } else {
          setTransactionError(err.message || "Failed to create bounty. Please try again.")
        }
      } else {
        setTransactionError("Failed to create bounty. Please try again.")
      }
    } finally {
      setLoading(false)
    }
  }

  const handleAcceptAISuggestions = (suggestions: AISuggestions) => {
    setDescription(suggestions.improvedDescription)
    setRequirements(suggestions.improvedRequirements.join('\n'))
    setReward(suggestions.suggestedReward.amount.toString())
    setDate(new Date(suggestions.suggestedDeadline.date))
    setShowAISuggestions(false)
  }

  // Show loading state while transaction is pending
  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-6">
            <TransactionProgress 
              stage={transactionStage} 
              errorMessage={transactionError || undefined}
            />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">Bounty Title</Label>
            <Input
              id="title"
              placeholder="Enter a clear title for your bounty"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe what this bounty is about"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="requirements">Requirements</Label>
            <Textarea
              id="requirements"
              placeholder="List the specific requirements for completing this bounty"
              rows={4}
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reward">Reward Amount (ETH)</Label>
            <Input
              id="reward"
              type="number"
              step="0.001"
              min="0"
              placeholder="0.00"
              value={reward}
              onChange={(e) => setReward(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Deadline</Label>
            <div className="flex gap-4">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start", !date && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PPP") : "Select a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="max-h-[300px] overflow-y-auto">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    initialFocus
                    className="p-0"
                    classNames={{
                      months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
                      month: "space-y-4",
                      caption: "flex justify-center pt-1 relative items-center",
                      caption_label: "text-sm font-medium",
                      nav: "space-x-1 flex items-center",
                      nav_button: "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
                      nav_button_previous: "absolute left-1",
                      nav_button_next: "absolute right-1",
                      table: "w-full border-collapse space-y-1",
                      head_row: "flex",
                      head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
                      row: "flex w-full mt-2",
                      cell: "text-center text-sm p-0 relative [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                      day: "h-9 w-9 p-0 font-normal aria-selected:opacity-100",
                      day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                      day_today: "bg-accent text-accent-foreground",
                      day_outside: "text-muted-foreground opacity-50",
                      day_disabled: "text-muted-foreground opacity-50",
                      day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
                      day_hidden: "invisible",
                    }}
                    disabled={(date: Date) => {
                      const today = new Date()
                      today.setHours(0, 0, 0, 0)
                      const compareDate = new Date(date)
                      compareDate.setHours(0, 0, 0, 0)
                      return compareDate < today
                    }}
                  />
                </PopoverContent>
              </Popover>
              <div className="relative w-32">
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="pr-8"
                />
                <Clock className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Selected deadline: {date && time ? format(new Date(date.getTime() + new Date(`1970-01-01T${time}`).getTime()), "dd/MM/yyyy HH:mm") : "Not set"}
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAISuggestions(!showAISuggestions)}
            >
              {showAISuggestions ? 'Hide AI Suggestions' : 'Get AI Suggestions'}
            </Button>
          </div>

          {showAISuggestions && (
            <BountyAISuggestions
              title={title}
              description={description}
              requirements={requirements}
              rewardAmount={reward}
              deadline={date ? date.toISOString().split('T')[0] : ''}
              onAccept={handleAcceptAISuggestions}
            />
          )}

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <Button type="submit" disabled={loading || !connected}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Bounty"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
