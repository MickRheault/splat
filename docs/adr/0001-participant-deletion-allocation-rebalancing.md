# Participant Deletion and Allocation Rebalancing

When a Participant is deleted from an active Bill, their associated Allocations are cleaned up immediately. If the affected Item is shared unevenly (split by quantity), the system will not auto-redistribute the deleted Participant's share, leaving the Item in an Under-allocation state. This forces the user to manually adjust the Assigned Quantities in Step 3 to ensure total allocations exactly match the Item Quantity, preserving audit accuracy.
