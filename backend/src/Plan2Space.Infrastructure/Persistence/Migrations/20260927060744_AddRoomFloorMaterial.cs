using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Plan2Space.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRoomFloorMaterial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "FloorMaterial",
                table: "Rooms",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FloorMaterial",
                table: "Rooms");
        }
    }
}
